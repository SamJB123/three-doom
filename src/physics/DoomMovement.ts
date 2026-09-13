import {linkThing,thingsInBounds} from './ThingLinks';
import {traceLines} from './LineTrace';
import {slideProjection} from './SlideProjection';
import {fineSin,fineCos} from '../math/angles';
import {finesine} from '../math/AngleTables';
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
import { MF_SOLID, MF_NOCLIP, MF_MISSILE, MF_SKULLFLY, MF_FLOAT, MF_DROPOFF, MF_TELEPORT, MOBJ_TYPES } from '../game/MobjData';

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
  mobjs?: Mobj[];
  reject?: Uint8Array;
  thingLinkSequence?: number;
}

// Temporary collision state (fixed-point)
let tmfloorz: Fixed = 0;
let tmceilingz: Fixed = 0;
let ceilingLine: Linedef|null=null;
export function movementCeilingLine():Linedef|null {return ceilingLine;}
let tmdropoffz: Fixed = 0;
let floatok = false;
export function moveOpening(): {floatok: boolean; floor: Fixed} { return {floatok, floor: tmfloorz}; }

const spechit: number[] = [];
export function specialContacts(): number[] { return [...spechit]; }
let crossSpecialCallback: ( ( lineIdx: number, oldSide: number, mo: Mobj ) => void ) | null = null;

export function setCrossSpecialCallback( cb: ( lineIdx: number, oldSide: number, mo: Mobj ) => void ): void {

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

export function pointOnLineSide(
  x: Fixed, y: Fixed,
  v1: Vertex, v2: Vertex
): number {

  const v1x = intToFixed( v1.x );
  const v1y = intToFixed( v1.y );
  const dx = intToFixed( v2.x ) - v1x;
  const dy = intToFixed( v2.y ) - v1y;
  const cross = ( ( x - v1x ) / FRACUNIT ) * dy - ( ( y - v1y ) / FRACUNIT ) * dx;
  if (dx === 0) return x <= v1x ? Number(dy > 0) : Number(dy < 0);
  if (dy === 0) return y <= v1y ? Number(dx < 0) : Number(dx > 0);
  return cross > 0 ? 0 : 1;

}

function boxOnLineSide(
  left: Fixed, bottom: Fixed, right: Fixed, top: Fixed,
  v1: Vertex, v2: Vertex
): number {

  const sides = [
    pointOnLineSide(left,bottom,v1,v2), pointOnLineSide(left,top,v1,v2),
    pointOnLineSide(right,bottom,v1,v2), pointOnLineSide(right,top,v1,v2)
  ];
  return sides.every(side => side === sides[0]) ? sides[0] : -1;

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
  mo: Mobj
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

  if ( !(mo.flags & MF_MISSILE) ) {
    if ( ld.flags & 1 ) return false;
    if ( mo.type !== 'MT_PLAYER' && (ld.flags & 2) ) return false;
  }

  if ( opening.openTop < tmceilingz ) {tmceilingz = opening.openTop;ceilingLine=ld;}
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
  map: DoomMapData,
  ignoreThings = false
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
  ceilingLine=null;
  spechit.length = 0;
  if ( mo.flags & MF_NOCLIP ) return true;
  // PIT_CheckThing: ordinary actors are infinitely tall in vanilla Doom.
  // Missile/skull damage is resolved by the mobj movement path.
  if ( !ignoreThings && !(mo.flags & (MF_MISSILE | MF_SKULLFLY)) ) {
    for ( const other of thingsInBounds(map,bbox.left-32*FRACUNIT,bbox.bottom-32*FRACUNIT,bbox.right+32*FRACUNIT,bbox.top+32*FRACUNIT) ) {
      if ( other === mo || other.removed || !(other.flags & MF_SOLID) ) continue;
      const distance = other.radius + mo.radius;
      if ( Math.abs(other.x - x) < distance && Math.abs(other.y - y) < distance ) return false;
    }
  }

  // Convert fixed bbox to integer for blockmap lookup
  const nearby = getLinedefsInBounds(
    map.blockmap,
    bbox.left >> FRACBITS, bbox.bottom >> FRACBITS,
    bbox.right >> FRACBITS, bbox.top >> FRACBITS
  );

  for ( const idx of nearby ) {

    if ( ! pitCheckLine(
      map.linedefs[ idx ], idx, map.vertexes, map.sidedefs, map.sectors,
      bbox, mo
    ) ) {

      return false;

    }

  }

  return true;

}

/** P_ThingHeightClip: preserve floor contact when a sector moves. */
export function clipThingHeight( mo: Mobj, map: DoomMapData ): boolean {
  const onFloor = mo.z === mo.floorz;
  checkPosition( mo, mo.x, mo.y, map, true );
  mo.floorz = tmfloorz;
  mo.ceilingz = tmceilingz;
  if ( onFloor ) mo.z = mo.floorz;
  else if ( mo.z + mo.height > mo.ceilingz ) mo.z = mo.ceilingz - mo.height;
  return mo.ceilingz - mo.floorz >= mo.height;
}

// ============================================================
// P_TryMove
// ============================================================

export function tryMove(
  mo: Mobj,
  x: Fixed, y: Fixed,
  map: DoomMapData
): boolean {

  floatok = false;
  if ( ! checkPosition( mo, x, y, map ) ) return false;

  if ( !(mo.flags & MF_NOCLIP) ) {
    if ( tmceilingz - tmfloorz < mo.height ) return false;
    floatok = true;
    if ( !(mo.flags & MF_TELEPORT) && tmceilingz - mo.z < mo.height ) return false;
    if ( !(mo.flags & MF_TELEPORT) && tmfloorz - mo.z > MAXSTEP ) return false;
    if ( !(mo.flags & (MF_DROPOFF | MF_FLOAT)) && tmfloorz - tmdropoffz > MAXSTEP ) return false;
  }
  const oldX = mo.x, oldY = mo.y;

  mo.floorz = tmfloorz;
  mo.ceilingz = tmceilingz;
  mo.x = x;
  mo.y = y;

  const sector = findSectorAtFixed( x, y, map );
  mo.sectorIndex = sector ? map.sectors.indexOf( sector ) : -1;
  linkThing(mo,map);
  if ( crossSpecialCallback && !(mo.flags & (MF_NOCLIP | MF_TELEPORT | MF_MISSILE)) ) {
    // Copy: teleport/other nested position checks may overwrite spechit.
    for ( const ldIdx of [...spechit].reverse() ) {
      const ld = map.linedefs[ldIdx];
      const a = map.vertexes[ld.v1], b = map.vertexes[ld.v2];
      const oldSide = pointOnLineSide(oldX, oldY, a, b);
      if ( oldSide !== pointOnLineSide(x, y, a, b) ) crossSpecialCallback(ldIdx, oldSide, mo);
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

  // P_SlideMove: trace the three leading corners, move up to the first wall,
  // then project the remaining momentum using P_HitSlideLine.
  for (let attempt=0; attempt<2; attempt++) {
    const leadX=mo.x+(mo.momx>0 ? mo.radius : -mo.radius), trailX=mo.x-(mo.momx>0 ? mo.radius : -mo.radius);
    const leadY=mo.y+(mo.momy>0 ? mo.radius : -mo.radius), trailY=mo.y-(mo.momy>0 ? mo.radius : -mo.radius);
    let best=FRACUNIT+1, hit: Linedef | null=null;
    for (const [x,y] of [[leadX,leadY],[trailX,leadY],[leadX,trailY]]) {
      for (const {lineIdx,frac} of traceLines(x,y,x+mo.momx,y+mo.momy,map).intercepts) {
        const line=map.linedefs[lineIdx],a=map.vertexes[line.v1],b=map.vertexes[line.v2];
        if(line.left<0&&pointOnLineSide(mo.x,mo.y,a,b))continue;
        let blocking=line.left<0;
        if(!blocking){
          const opening=lineOpening(line,map.sidedefs,map.sectors);
          blocking=opening.openRange<mo.height||opening.openTop-mo.z<mo.height||opening.openBottom-mo.z>MAXSTEP;
        }
        if(!blocking)continue;
        if(frac<best){best=frac;hit=line;}
        break;
      }
    }
    if (!hit) break;
    const approach=best-0x800;
    if (approach>0 && !tryMove(mo,mo.x+fixedMul(mo.momx,approach),mo.y+fixedMul(mo.momy,approach),map)) break;
    const remaining=FRACUNIT-best;
    if(remaining<=0)return;
    const a=map.vertexes[hit.v1], b=map.vertexes[hit.v2], dx=b.x-a.x, dy=b.y-a.y;
    [mo.momx,mo.momy]=slideProjection(fixedMul(mo.momx,remaining),fixedMul(mo.momy,remaining),intToFixed(dx),intToFixed(dy),pointOnLineSide(mo.x,mo.y,a,b));
    if (tryMove(mo,mo.x+mo.momx,mo.y+mo.momy,map)) return;
  }
  if(!tryMove(mo,mo.x,mo.y+mo.momy,map))tryMove(mo,mo.x+mo.momx,mo.y,map);

}

// ============================================================
// P_XYMovement — with fixed-point friction
// ============================================================

export function xyMovement(
  mo: Mobj,
  map: DoomMapData,
  movementCommand=false
): boolean {

  if ( mo.momx === 0 && mo.momy === 0 ) return false;

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

    if ( xmove > ( MAXMOVE >> 1 ) || ymove > ( MAXMOVE >> 1 ) ) {

      ptryx = mo.x + Math.trunc( xmove / 2 );
      ptryy = mo.y + Math.trunc( ymove / 2 );
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
  if ( mo.z > mo.floorz ) return false;

  if ( !movementCommand && Math.abs( mo.momx ) < STOPSPEED && Math.abs( mo.momy ) < STOPSPEED ) {

    mo.momx = 0;
    mo.momy = 0;
    return true;

  } else {

    mo.momx = fixedMul( mo.momx, FRICTION );
    mo.momy = fixedMul( mo.momy, FRICTION );

  }
  return false;
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

    const thrust = Math.round(fwdThrust * forwardMove);
    player.mo.momx += fixedMul( thrust, fineCos(angle) );
    player.mo.momy += fixedMul( thrust, fineSin(angle) );

  }

  if ( sideMove !== 0 ) {

    const thrust = Math.round(sideThrust * sideMove);
    player.mo.momx += fixedMul( thrust, fineCos(angle - Math.PI / 2) );
    player.mo.momy += fixedMul( thrust, fineSin(angle - Math.PI / 2) );

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
  const fine = (409 * levelTime) & 8191;
  const viewBob = fixedMul(bob >> 1, finesine[fine]);

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
