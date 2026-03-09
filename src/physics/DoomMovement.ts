// Ported from: linuxdoom-1.10/p_map.c, p_mobj.c, p_user.c
// Doom's 2D collision and movement system.
//
// All positions, velocities and distances use 16.16 fixed-point arithmetic.
// Map data (vertices, sectors) from the WAD are integers — converted to
// fixed-point at point of use within the physics system.

import type { Vertex, Linedef, Sidedef, Sector, Seg, Subsector, BspNode, Blockmap } from '../wad';
import { getLinedefsInBounds } from '../wad/BlockmapParser';
import type { Fixed } from '../math/fixed';
import { FRACBITS, FRACUNIT, fixedMul, fixedDiv, intToFixed, floatToFixed } from '../math/fixed';

// ============================================================
// Constants — original fixed-point values from Doom source
// ============================================================

const MAXMOVE = 30 * FRACUNIT;             // p_local.h
const FRICTION = 0xe800;                    // p_mobj.c: 59392 (~0.90625)
const STOPSPEED = 0x1000;                   // p_mobj.c: 4096 (~0.0625)
const GRAVITY = FRACUNIT;                   // p_local.h
const MAXSTEP = 24 * FRACUNIT;             // p_map.c
const VIEWHEIGHT = 41 * FRACUNIT;          // p_local.h
const PLAYER_HEIGHT = 56 * FRACUNIT;       // mobjinfo
const PLAYER_RADIUS = 16 * FRACUNIT;       // mobjinfo
const MAXBOB = 0x100000;                    // p_user.c: 16 * FRACUNIT

// g_game.c: forwardmove * 2048 gives the fixed-point thrust
const FORWARDMOVE_WALK = 25 * 2048;         // 51200
const FORWARDMOVE_RUN  = 50 * 2048;         // 102400
const SIDEMOVE_WALK    = 24 * 2048;         // 49152
const SIDEMOVE_RUN     = 40 * 2048;         // 81920

const NF_SUBSECTOR = 0x8000;

// ============================================================
// Interfaces — all position/velocity fields are 16.16 fixed-point
// ============================================================

// DoomMobj is now an alias for the full Mobj interface from game/Mobj.ts.
// The player's mo is a real Mobj so enemies can target it directly.
export type { Mobj as DoomMobj } from '../game/Mobj';
import type { Mobj } from '../game/Mobj';
import { MOBJ_TYPES } from '../game/MobjData';

export interface DoomPlayer {
  mo: Mobj;
  viewheight: Fixed;
  deltaviewheight: Fixed;
  viewz: Fixed;
  bob: Fixed;
  running: boolean;
}

export interface DoomMapData {
  vertexes: Vertex[];
  linedefs: Linedef[];
  sidedefs: Sidedef[];
  sectors: Sector[];
  segs: Seg[];
  subsectors: Subsector[];
  nodes: BspNode[];
  blockmap: Blockmap;
}

// Temporary collision state (fixed-point)
let tmfloorz: Fixed = 0;
let tmceilingz: Fixed = 0;
let tmdropoffz: Fixed = 0;

const spechit: number[] = [];
let crossSpecialCallback: ( ( lineIdx: number ) => void ) | null = null;

export function setCrossSpecialCallback( cb: ( lineIdx: number ) => void ): void {

  crossSpecialCallback = cb;

}

// ============================================================
// R_PointInSubsector — BSP tree traversal (integer coords)
// ============================================================

export function pointInSubsector(
  x: number, y: number,
  nodes: BspNode[],
  subsectors: Subsector[]
): number {

  if ( nodes.length === 0 ) return 0;

  let nodeIdx = nodes.length - 1;

  while ( ! ( nodeIdx & NF_SUBSECTOR ) ) {

    const node = nodes[ nodeIdx ];
    const dx = x - node.x;
    const dy = y - node.y;
    const cross = dx * node.dy - dy * node.dx;

    nodeIdx = cross > 0 ? node.rightChild : node.leftChild;

  }

  return nodeIdx & ~NF_SUBSECTOR;

}

/** Find sector at integer map coordinates */
export function findSectorAt(
  x: number, y: number,
  map: DoomMapData
): Sector | null {

  const ssIdx = pointInSubsector( x, y, map.nodes, map.subsectors );
  const ss = map.subsectors[ ssIdx ];
  if ( ! ss ) return null;

  const seg = map.segs[ ss.firstSeg ];
  if ( ! seg ) return null;

  const ld = map.linedefs[ seg.linedef ];
  const sideIdx = seg.side === 0 ? ld.right : ld.left;
  if ( sideIdx < 0 ) return null;

  return map.sectors[ map.sidedefs[ sideIdx ].sector ];

}

/** Find sector at fixed-point coordinates (converts to integer for BSP) */
export function findSectorAtFixed(
  x: Fixed, y: Fixed,
  map: DoomMapData
): Sector | null {

  return findSectorAt( x >> FRACBITS, y >> FRACBITS, map );

}

// ============================================================
// Line-side tests (operate in fixed-point)
// Vertex coords are converted from WAD integers at point of use
// ============================================================

function pointOnLineSide(
  x: Fixed, y: Fixed,
  v1: Vertex, v2: Vertex
): number {

  const v1x = intToFixed( v1.x );
  const v1y = intToFixed( v1.y );
  const dx = intToFixed( v2.x ) - v1x;
  const dy = intToFixed( v2.y ) - v1y;
  const cross = ( ( x - v1x ) / FRACUNIT ) * dy - ( ( y - v1y ) / FRACUNIT ) * dx;
  return cross <= 0 ? 0 : 1;

}

function boxOnLineSide(
  left: Fixed, bottom: Fixed, right: Fixed, top: Fixed,
  v1: Vertex, v2: Vertex
): number {

  const v1x = intToFixed( v1.x );
  const v1y = intToFixed( v1.y );
  const dx = intToFixed( v2.x ) - v1x;
  const dy = intToFixed( v2.y ) - v1y;

  let p1: number;
  let p2: number;

  if ( dx === 0 ) {

    if ( dy > 0 ) {

      p1 = right > v1x ? 0 : 1;
      p2 = left > v1x ? 0 : 1;

    } else {

      p1 = left > v1x ? 0 : 1;
      p2 = right > v1x ? 0 : 1;

    }

  } else if ( dy === 0 ) {

    if ( dx > 0 ) {

      p1 = top > v1y ? 0 : 1;
      p2 = bottom > v1y ? 0 : 1;

    } else {

      p1 = bottom > v1y ? 0 : 1;
      p2 = top > v1y ? 0 : 1;

    }

  } else {

    const cx1 = dx > 0 ? left : right;
    const cy1 = dy > 0 ? bottom : top;
    const cx2 = dx > 0 ? right : left;
    const cy2 = dy > 0 ? top : bottom;

    // Scale down to avoid overflow in cross product
    p1 = ( ( cx1 - v1x ) / FRACUNIT ) * dy - ( ( cy1 - v1y ) / FRACUNIT ) * dx <= 0 ? 0 : 1;
    p2 = ( ( cx2 - v1x ) / FRACUNIT ) * dy - ( ( cy2 - v1y ) / FRACUNIT ) * dx <= 0 ? 0 : 1;

  }

  if ( p1 === p2 ) return p1;
  return - 1;

}

// ============================================================
// P_LineOpening (sector heights → fixed-point)
// ============================================================

interface LineOpening {
  openTop: Fixed;
  openBottom: Fixed;
  openRange: Fixed;
  lowFloor: Fixed;
}

function lineOpening(
  ld: Linedef,
  sidedefs: Sidedef[],
  sectors: Sector[]
): LineOpening {

  const front = sectors[ sidedefs[ ld.right ].sector ];
  const back = sectors[ sidedefs[ ld.left ].sector ];

  const openTop = intToFixed( Math.min( front.ceilingHeight, back.ceilingHeight ) );
  const openBottom = intToFixed( Math.max( front.floorHeight, back.floorHeight ) );
  const lowFloor = intToFixed( Math.min( front.floorHeight, back.floorHeight ) );

  return {
    openTop,
    openBottom,
    openRange: openTop - openBottom,
    lowFloor
  };

}

// ============================================================
// PIT_CheckLine
// ============================================================

function pitCheckLine(
  ld: Linedef,
  ldIdx: number,
  vertexes: Vertex[],
  sidedefs: Sidedef[],
  sectors: Sector[],
  bbox: { left: Fixed; right: Fixed; top: Fixed; bottom: Fixed },
  mobjHeight: Fixed
): boolean {

  const v1 = vertexes[ ld.v1 ];
  const v2 = vertexes[ ld.v2 ];

  // Quick bbox reject (convert vertex bbox to fixed)
  const lineLeft = intToFixed( Math.min( v1.x, v2.x ) );
  const lineRight = intToFixed( Math.max( v1.x, v2.x ) );
  const lineBottom = intToFixed( Math.min( v1.y, v2.y ) );
  const lineTop = intToFixed( Math.max( v1.y, v2.y ) );

  if ( bbox.right <= lineLeft || bbox.left >= lineRight ||
       bbox.top <= lineBottom || bbox.bottom >= lineTop ) {

    return true;

  }

  if ( boxOnLineSide( bbox.left, bbox.bottom, bbox.right, bbox.top, v1, v2 ) !== - 1 ) {

    return true;

  }

  if ( ld.left < 0 ) return false;

  const opening = lineOpening( ld, sidedefs, sectors );

  if ( opening.openRange < mobjHeight ) return false;

  if ( opening.openTop < tmceilingz ) tmceilingz = opening.openTop;
  if ( opening.openBottom > tmfloorz ) tmfloorz = opening.openBottom;
  if ( opening.lowFloor < tmdropoffz ) tmdropoffz = opening.lowFloor;

  if ( ld.special !== 0 ) spechit.push( ldIdx );

  return true;

}

// ============================================================
// P_CheckPosition
// ============================================================

export function checkPosition(
  mo: Mobj,
  x: Fixed, y: Fixed,
  map: DoomMapData
): boolean {

  const bbox = {
    left: x - mo.radius,
    right: x + mo.radius,
    bottom: y - mo.radius,
    top: y + mo.radius
  };

  const sector = findSectorAtFixed( x, y, map );

  if ( sector ) {

    tmfloorz = intToFixed( sector.floorHeight );
    tmceilingz = intToFixed( sector.ceilingHeight );

  } else {

    tmfloorz = 0;
    tmceilingz = intToFixed( 1024 );

  }

  tmdropoffz = tmfloorz;
  spechit.length = 0;

  // Convert fixed bbox to integer for blockmap lookup
  const nearby = getLinedefsInBounds(
    map.blockmap,
    bbox.left >> FRACBITS, bbox.bottom >> FRACBITS,
    bbox.right >> FRACBITS, bbox.top >> FRACBITS
  );

  for ( const idx of nearby ) {

    if ( ! pitCheckLine(
      map.linedefs[ idx ], idx, map.vertexes, map.sidedefs, map.sectors,
      bbox, mo.height
    ) ) {

      return false;

    }

  }

  return true;

}

// ============================================================
// P_TryMove
// ============================================================

export function tryMove(
  mo: Mobj,
  x: Fixed, y: Fixed,
  map: DoomMapData
): boolean {

  if ( ! checkPosition( mo, x, y, map ) ) return false;

  if ( tmceilingz - tmfloorz < mo.height ) return false;
  if ( tmceilingz - mo.z < mo.height ) return false;
  if ( tmfloorz - mo.z > MAXSTEP ) return false;
  if ( tmfloorz - tmdropoffz > MAXSTEP ) return false;

  mo.floorz = tmfloorz;
  mo.ceilingz = tmceilingz;
  mo.x = x;
  mo.y = y;

  if ( crossSpecialCallback ) {

    for ( const ldIdx of spechit ) {

      crossSpecialCallback( ldIdx );

    }

  }

  return true;

}

// ============================================================
// P_SlideMove
// ============================================================

export function slideMove(
  mo: Mobj,
  map: DoomMapData
): void {

  if ( tryMove( mo, mo.x + mo.momx, mo.y + mo.momy, map ) ) return;

  if ( mo.momx !== 0 && tryMove( mo, mo.x + mo.momx, mo.y, map ) ) {

    mo.momy = 0;
    return;

  }

  if ( mo.momy !== 0 && tryMove( mo, mo.x, mo.y + mo.momy, map ) ) {

    mo.momx = 0;
    return;

  }

  mo.momx = 0;
  mo.momy = 0;

}

// ============================================================
// P_XYMovement — with fixed-point friction
// ============================================================

export function xyMovement(
  mo: Mobj,
  map: DoomMapData
): void {

  if ( mo.momx === 0 && mo.momy === 0 ) return;

  // Clamp momentum
  if ( mo.momx > MAXMOVE ) mo.momx = MAXMOVE;
  else if ( mo.momx < - MAXMOVE ) mo.momx = - MAXMOVE;
  if ( mo.momy > MAXMOVE ) mo.momy = MAXMOVE;
  else if ( mo.momy < - MAXMOVE ) mo.momy = - MAXMOVE;

  let xmove = mo.momx;
  let ymove = mo.momy;

  while ( xmove !== 0 || ymove !== 0 ) {

    let ptryx: Fixed;
    let ptryy: Fixed;

    if ( xmove > ( MAXMOVE >> 1 ) || xmove < - ( MAXMOVE >> 1 ) ||
         ymove > ( MAXMOVE >> 1 ) || ymove < - ( MAXMOVE >> 1 ) ) {

      ptryx = mo.x + ( xmove >> 1 );
      ptryy = mo.y + ( ymove >> 1 );
      xmove >>= 1;
      ymove >>= 1;

    } else {

      ptryx = mo.x + xmove;
      ptryy = mo.y + ymove;
      xmove = 0;
      ymove = 0;

    }

    if ( ! tryMove( mo, ptryx, ptryy, map ) ) {

      slideMove( mo, map );
      break;

    }

  }

  // Friction (only on ground)
  if ( mo.z > mo.floorz ) return;

  if ( Math.abs( mo.momx ) < STOPSPEED && Math.abs( mo.momy ) < STOPSPEED ) {

    mo.momx = 0;
    mo.momy = 0;

  } else {

    mo.momx = fixedMul( mo.momx, FRICTION );
    mo.momy = fixedMul( mo.momy, FRICTION );

  }

}

// ============================================================
// P_ZMovement
// ============================================================

export function zMovement( mo: Mobj, player: DoomPlayer ): void {

  // Smooth step-up
  if ( mo.z < mo.floorz ) {

    player.viewheight -= mo.floorz - mo.z;
    player.deltaviewheight = ( VIEWHEIGHT - player.viewheight ) >> 3;

  }

  mo.z += mo.momz;

  // Hit floor
  if ( mo.z <= mo.floorz ) {

    if ( mo.momz < - ( GRAVITY * 8 ) ) {

      player.deltaviewheight = mo.momz >> 3;

    }

    mo.z = mo.floorz;
    mo.momz = 0;

  }

  // Hit ceiling
  if ( mo.z + mo.height > mo.ceilingz ) {

    mo.z = mo.ceilingz - mo.height;
    if ( mo.momz > 0 ) mo.momz = 0;

  }

  // Gravity
  if ( mo.z > mo.floorz && ! mo.onground ) {

    mo.momz -= GRAVITY;

  } else if ( mo.z > mo.floorz ) {

    mo.momz = - ( GRAVITY * 2 );

  }

  mo.onground = mo.z <= mo.floorz;

}

// ============================================================
// P_MovePlayer — fixed-point thrust from input
// ============================================================

export function movePlayer(
  player: DoomPlayer,
  forwardMove: number,
  sideMove: number,
  angle: number
): void {

  if ( ! player.mo.onground ) return;

  const fwdThrust = player.running ? FORWARDMOVE_RUN : FORWARDMOVE_WALK;
  const sideThrust = player.running ? SIDEMOVE_RUN : SIDEMOVE_WALK;

  if ( forwardMove !== 0 ) {

    const thrust = fwdThrust * forwardMove;
    player.mo.momx += fixedMul( thrust, floatToFixed( Math.cos( angle ) ) );
    player.mo.momy += fixedMul( thrust, floatToFixed( Math.sin( angle ) ) );

  }

  if ( sideMove !== 0 ) {

    const thrust = sideThrust * sideMove;
    player.mo.momx += fixedMul( thrust, floatToFixed( Math.cos( angle - Math.PI / 2 ) ) );
    player.mo.momy += fixedMul( thrust, floatToFixed( Math.sin( angle - Math.PI / 2 ) ) );

  }

}

// ============================================================
// P_CalcHeight — view bobbing (fixed-point)
// ============================================================

export function calcHeight( player: DoomPlayer, levelTime: number ): void {

  // Bob = (momx² + momy²) >> 2, capped at MAXBOB
  const bob = Math.min( MAXBOB,
    ( fixedMul( player.mo.momx, player.mo.momx ) +
      fixedMul( player.mo.momy, player.mo.momy ) ) >> 2
  );

  player.bob = bob;

  if ( ! player.mo.onground ) {

    player.viewz = player.mo.z + VIEWHEIGHT;

    if ( player.viewz > player.mo.ceilingz - ( 4 * FRACUNIT ) ) {

      player.viewz = player.mo.ceilingz - ( 4 * FRACUNIT );

    }

    return;

  }

  // Smooth view height recovery
  player.viewheight += player.deltaviewheight;

  if ( player.viewheight > VIEWHEIGHT ) {

    player.viewheight = VIEWHEIGHT;
    player.deltaviewheight = 0;

  }

  if ( player.viewheight < ( VIEWHEIGHT >> 1 ) ) {

    player.viewheight = VIEWHEIGHT >> 1;

    if ( player.deltaviewheight <= 0 ) {

      player.deltaviewheight = 1;

    }

  }

  if ( player.deltaviewheight !== 0 ) {

    // FRACUNIT/4 per tic
    player.deltaviewheight += FRACUNIT >> 2;

    if ( player.deltaviewheight === 0 ) {

      player.deltaviewheight = 1;

    }

  }

  // Bob oscillation: angle = (FINEANGLES/20 * leveltime) & FINEMASK
  // FINEANGLES = 8192, FINEMASK = 8191
  const fine = ( ( 8192 / 20 * levelTime ) | 0 ) & 8191;
  const bobAngle = fine * Math.PI * 2 / 8192;
  const viewBob = fixedMul( bob >> 1, floatToFixed( Math.sin( bobAngle ) ) );

  player.viewz = player.mo.z + player.viewheight + viewBob;

  if ( player.viewz > player.mo.ceilingz - ( 4 * FRACUNIT ) ) {

    player.viewz = player.mo.ceilingz - ( 4 * FRACUNIT );

  }

}

// ============================================================
// Create player at spawn point (integer coords → fixed-point)
// ============================================================

export function createPlayer( x: number, y: number, floorZ: number ): DoomPlayer {

  const fx = intToFixed( x );
  const fy = intToFixed( y );
  const fz = intToFixed( floorZ );

  const info = MOBJ_TYPES[ 'MT_PLAYER' ];

  const mo: Mobj = {
    x: fx,
    y: fy,
    z: fz,
    momx: 0,
    momy: 0,
    momz: 0,
    radius: PLAYER_RADIUS,
    height: PLAYER_HEIGHT,
    floorz: fz,
    ceilingz: fz + intToFixed( 128 ),
    onground: true,
    angle: 0,
    type: 'MT_PLAYER',
    info,
    flags: info.flags,
    health: info.spawnHealth,
    state: info.spawnState,
    tics: - 1,
    sectorIndex: - 1,
    target: null,
    tracer: null,
    threshold: 0,
    reactionTime: 0,
    moveDir: 8,
    movecount: 0,
    lastLook: 0,
    mesh: null,
    removed: false,
  };

  return {
    mo,
    viewheight: VIEWHEIGHT,
    deltaviewheight: 0,
    viewz: fz + VIEWHEIGHT,
    bob: 0,
    running: false
  };

}
