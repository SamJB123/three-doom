import {spawnHitEffect} from './HitEffects';
import {fineSin,fineCos,pointToRadians} from '../math/angles';
// Hitscan attack, damage, and radius attack — ported from p_map.c / p_inter.c.
// Implements P_LineAttack (bullet tracing via P_PathTraverse-style blockmap DDA),
// P_DamageMobj, and P_RadiusAttack.
//
// P_LineAttack uses a DDA grid traversal of the blockmap to collect intercepts
// (lines and things the ray crosses), sorts them by distance, and processes
// them in order — stopping at the first solid wall or hit thing.
// This matches the original Doom's p_map.c implementation.

import type { Fixed } from '../math/fixed';
import { FRACUNIT, FRACBITS, intToFixed, fixedToFloat, fixedMul, fixedDiv, floatToFixed } from '../math/fixed';
import type { DoomMapData, DoomPlayer } from '../physics/DoomMovement';
import { findSectorAtFixed } from '../physics/DoomMovement';
import type { Mobj } from './Mobj';
import { allMobjs, setMobjState, spawnMobj, setExplodeCallback, setBfgSprayCallback, setDamageMobjCallback, setMissileAimCallback } from './Mobj';
import { MF_SHOOTABLE, MF_NOBLOOD, MF_SOLID, MF_CORPSE, MF_SKULLFLY, MF_JUSTHIT, MF_FLOAT, MF_NOGRAVITY, MF_DROPOFF, MF_DROPPED } from './MobjData';
import { P_Random } from './DoomRandom';
import { playSoundAt } from '../sound';
import type { PlayerStatusState } from '../ecs/traits';
import { shootSpecialLine } from './UseAction';
import { P_CheckSight } from './Sight';

// ============================================================
// Constants
// ============================================================

const MISSILERANGE = ( 32 * 64 ) * FRACUNIT; // 2048 map units
const MELEERANGE = 64 * FRACUNIT;
const MAXRADIUS = 32 * FRACUNIT;
const MAPBLOCKSIZE = 128;
const MAPBLOCKSHIFT = 7;
const MAXINTERCEPTS = 128;

// ============================================================
// Init — register A_Explode callback
// ============================================================

export function initAttackSystem(): void {

  setExplodeCallback( A_Explode );
  setBfgSprayCallback(A_BFGSpray);
  setDamageMobjCallback( damageMobj );
  setMissileAimCallback(aimLineAttack);

}

// ============================================================
// Map reference
// ============================================================

let attackMap: DoomMapData | null = null;

export function setAttackMap( map: DoomMapData ): void {

  attackMap = map;

}

// ============================================================
// Intercept — a ray intersection with either a line or a thing
// ============================================================

interface Intercept {
  frac: Fixed;       // distance fraction along the ray (fixed-point)
  isLine: boolean;   // true = linedef, false = thing
  lineIdx: number;   // linedef index (if isLine)
  thing: Mobj | null; // mobj (if !isLine)
}

// ============================================================
// DivLine — ray or line segment for intersection math
// ============================================================

interface DivLine {
  x: Fixed;
  y: Fixed;
  dx: Fixed;
  dy: Fixed;
}

// ============================================================
// Point-on-divline side test (fixed-point)
// Returns 0 (front) or 1 (back)
// ============================================================

function pointOnDivlineSide( x: Fixed, y: Fixed, line: DivLine ): 0 | 1 {

  if ( line.dx === 0 ) {

    if ( x <= line.x ) return line.dy > 0 ? 1 : 0;
    return line.dy < 0 ? 1 : 0;

  }

  if ( line.dy === 0 ) {

    if ( y <= line.y ) return line.dx < 0 ? 1 : 0;
    return line.dx > 0 ? 1 : 0;

  }

  const dx = x - line.x;
  const dy = y - line.y;

  // Overflow-safe cross product using right shifts
  const left = fixedMul( line.dy >> 8, dx >> 8 );
  const right = fixedMul( dy >> 8, line.dx >> 8 );

  return right < left ? 0 : 1;

}

// ============================================================
// Intercept vector — parametric intersection of two divlines
// Returns fixed-point fraction along v2 where v1 crosses it
// ============================================================

function interceptVector( v2: DivLine, v1: DivLine ): Fixed {

  const den = fixedMul( v1.dy >> 8, v2.dx ) - fixedMul( v1.dx >> 8, v2.dy );
  if ( den === 0 ) return 0;

  const num = fixedMul( ( v1.x - v2.x ) >> 8, v1.dy ) + fixedMul( ( v2.y - v1.y ) >> 8, v1.dx );
  return fixedDiv( num, den );

}

// ============================================================
// Line opening — vertical gap through a two-sided linedef
// ============================================================

function lineOpening( lineIdx: number, map: DoomMapData ): { openTop: Fixed; openBottom: Fixed } | null {

  const line = map.linedefs[ lineIdx ];
  if ( line.left < 0 ) return null; // one-sided

  const front = map.sectors[ map.sidedefs[ line.right ].sector ];
  const back = map.sectors[ map.sidedefs[ line.left ].sector ];

  return {
    openTop: intToFixed( Math.min( front.ceilingHeight, back.ceilingHeight ) ),
    openBottom: intToFixed( Math.max( front.floorHeight, back.floorHeight ) )
  };

}

// ============================================================
// Per-traversal linedef stamp to avoid processing a line twice
// ============================================================

let traverseValidCount = 0;
let lineTraverseStamp: Int32Array | null = null;

function ensureTraverseStamp( numLinedefs: number ): void {

  if ( ! lineTraverseStamp || lineTraverseStamp.length < numLinedefs ) {

    lineTraverseStamp = new Int32Array( numLinedefs );

  }

}

// ============================================================
// P_PathTraverse — DDA blockmap grid walk collecting intercepts
// Ported from p_map.c P_PathTraverse
// ============================================================

function pathTraverse(
  x1: Fixed, y1: Fixed,
  x2: Fixed, y2: Fixed,
  map: DoomMapData,
  addLines: boolean,
  addThings: boolean,
  traverser: ( intercept: Intercept ) => boolean
): void {

  const { blockmap, linedefs, vertexes } = map;

  const trace: DivLine = { x: x1, y: y1, dx: x2 - x1, dy: y2 - y1 };

  ensureTraverseStamp( linedefs.length );
  traverseValidCount ++;
  const vc = traverseValidCount;

  const intercepts: Intercept[] = [];

  // --- Collect line intercepts in blockmap cells ---

  // Convert to map units for blockmap grid
  let mx1 = x1 >> FRACBITS;
  let my1 = y1 >> FRACBITS;
  const mx2 = x2 >> FRACBITS;
  const my2 = y2 >> FRACBITS;

  // Nudge start position off block boundaries (original Doom does this)
  if ( ( ( mx1 - blockmap.originX ) & ( MAPBLOCKSIZE - 1 ) ) === 0 ) mx1 += 1;
  if ( ( ( my1 - blockmap.originY ) & ( MAPBLOCKSIZE - 1 ) ) === 0 ) my1 += 1;

  const tx1 = Math.floor( ( mx1 - blockmap.originX ) / MAPBLOCKSIZE );
  const ty1 = Math.floor( ( my1 - blockmap.originY ) / MAPBLOCKSIZE );
  const tx2 = Math.floor( ( mx2 - blockmap.originX ) / MAPBLOCKSIZE );
  const ty2 = Math.floor( ( my2 - blockmap.originY ) / MAPBLOCKSIZE );

  let mapX = tx1;
  let mapY = ty1;

  // DDA step setup
  let mapXStep: number, mapYStep: number;
  let xIntercept: number, yIntercept: number;
  let xStep: number, yStep: number;

  const adx = Math.abs( mx2 - mx1 );
  const ady = Math.abs( my2 - my1 );

  // X step
  if ( tx2 > tx1 ) {

    mapXStep = 1;
    const partial = MAPBLOCKSIZE - ( ( mx1 - blockmap.originX ) % MAPBLOCKSIZE );
    yStep = ady === 0 ? 0 : ( my2 - my1 ) * MAPBLOCKSIZE / adx;
    yIntercept = ( my1 - blockmap.originY ) + partial * ( my2 - my1 ) / adx;

  } else if ( tx2 < tx1 ) {

    mapXStep = - 1;
    const partial = ( mx1 - blockmap.originX ) % MAPBLOCKSIZE;
    yStep = ady === 0 ? 0 : ( my2 - my1 ) * MAPBLOCKSIZE / adx;
    yIntercept = ( my1 - blockmap.originY ) + partial * ( my2 - my1 ) / adx;

  } else {

    mapXStep = 0;
    yStep = 256 * MAPBLOCKSIZE;
    yIntercept = 0x7FFFFFFF;

  }

  // Y step
  if ( ty2 > ty1 ) {

    mapYStep = 1;
    const partial = MAPBLOCKSIZE - ( ( my1 - blockmap.originY ) % MAPBLOCKSIZE );
    xStep = adx === 0 ? 0 : ( mx2 - mx1 ) * MAPBLOCKSIZE / ady;
    xIntercept = ( mx1 - blockmap.originX ) + partial * ( mx2 - mx1 ) / ady;

  } else if ( ty2 < ty1 ) {

    mapYStep = - 1;
    const partial = ( my1 - blockmap.originY ) % MAPBLOCKSIZE;
    xStep = adx === 0 ? 0 : ( mx2 - mx1 ) * MAPBLOCKSIZE / ady;
    xIntercept = ( mx1 - blockmap.originX ) + partial * ( mx2 - mx1 ) / ady;

  } else {

    mapYStep = 0;
    xStep = 256 * MAPBLOCKSIZE;
    xIntercept = 0x7FFFFFFF;

  }

  // Walk the grid
  for ( let count = 0; count < 64; count ++ ) {

    // Process lines in current block
    if ( addLines &&
         mapX >= 0 && mapX < blockmap.columns &&
         mapY >= 0 && mapY < blockmap.rows ) {

      const blockIdx = mapY * blockmap.columns + mapX;
      const list = blockmap.lists[ blockIdx ];

      for ( const ldIdx of list ) {

        if ( lineTraverseStamp![ ldIdx ] === vc ) continue;
        lineTraverseStamp![ ldIdx ] = vc;

        const ld = linedefs[ ldIdx ];
        const v1 = vertexes[ ld.v1 ];
        const v2 = vertexes[ ld.v2 ];

        const lv1x = intToFixed( v1.x );
        const lv1y = intToFixed( v1.y );
        const lv2x = intToFixed( v2.x );
        const lv2y = intToFixed( v2.y );

        // Check if trace crosses this line
        const s1 = pointOnDivlineSide( lv1x, lv1y, trace );
        const s2 = pointOnDivlineSide( lv2x, lv2y, trace );
        if ( s1 === s2 ) continue;

        const lineDiv: DivLine = {
          x: lv1x, y: lv1y,
          dx: lv2x - lv1x, dy: lv2y - lv1y
        };

        const frac = interceptVector( trace, lineDiv );
        if ( frac < 0 ) continue;

        if ( intercepts.length < MAXINTERCEPTS ) {

          intercepts.push( { frac, isLine: true, lineIdx: ldIdx, thing: null } );

        }

      }

    }

    // Check if done
    if ( mapX === tx2 && mapY === ty2 ) break;

    // Step to next block (DDA)
    const yCheck = Math.floor( yIntercept / MAPBLOCKSIZE );
    const xCheck = Math.floor( xIntercept / MAPBLOCKSIZE );

    if ( yCheck === mapY ) {

      yIntercept += yStep;
      mapX += mapXStep;

    } else if ( xCheck === mapX ) {

      xIntercept += xStep;
      mapY += mapYStep;

    } else {

      // Both boundaries crossed — step whichever is closer
      // (shouldn't normally happen, but handle gracefully)
      yIntercept += yStep;
      mapX += mapXStep;

    }

  }

  // --- Collect thing intercepts ---
  if ( addThings ) {

    for ( const mo of allMobjs ) {

      if ( mo.removed ) continue;
      if ( ! ( mo.flags & MF_SHOOTABLE ) ) continue;
      if ( mo.health <= 0 ) continue;

      // Bounding box test against the trace
      let ax: Fixed, ay: Fixed, bx: Fixed, by: Fixed;

      if ( ( trace.dx ^ trace.dy ) > 0 ) {

        ax = mo.x - mo.radius;
        ay = mo.y + mo.radius;
        bx = mo.x + mo.radius;
        by = mo.y - mo.radius;

      } else {

        ax = mo.x - mo.radius;
        ay = mo.y - mo.radius;
        bx = mo.x + mo.radius;
        by = mo.y + mo.radius;

      }

      const s1 = pointOnDivlineSide( ax, ay, trace );
      const s2 = pointOnDivlineSide( bx, by, trace );
      if ( s1 === s2 ) continue;

      const thingDiv: DivLine = { x: ax, y: ay, dx: bx - ax, dy: by - ay };
      const frac = interceptVector( trace, thingDiv );
      if ( frac < 0 ) continue;

      if ( intercepts.length < MAXINTERCEPTS ) {

        intercepts.push( { frac, isLine: false, lineIdx: - 1, thing: mo } );

      }

    }

  }

  // --- Sort intercepts by distance and process ---
  // Use selection sort (like original Doom) — n is typically small
  const pending = intercepts.slice();

  while ( pending.length > 0 ) {

    let bestIdx = 0;
    let bestFrac = pending[ 0 ].frac;

    for ( let i = 1; i < pending.length; i ++ ) {

      if ( pending[ i ].frac < bestFrac ) {

        bestFrac = pending[ i ].frac;
        bestIdx = i;

      }

    }

    if ( bestFrac > FRACUNIT ) break; // beyond range

    const ic = pending.splice( bestIdx, 1 )[ 0 ];
    if ( ! traverser( ic ) ) return; // traverser says stop

  }

}

// ============================================================
// P_LineAttack — fire a hitscan ray from (x, y, z) at angle/slope
// Ported from p_map.c P_LineAttack using P_PathTraverse
// ============================================================

/** P_AimLineAttack / PTR_AimTraverse: narrow vertical sight through openings. */
export function aimLineAttack(source: Mobj, angle: number, range: Fixed): {slope: Fixed; target: Mobj | null} {
  const result: {slope: Fixed; target: Mobj | null} = {slope:0,target:null};
  if (!attackMap) return result;
  const shootZ = source.z + (source.height >> 1) + 8 * FRACUNIT;
  let top = 100 * FRACUNIT / 160, bottom = -top;
  pathTraverse(source.x, source.y, source.x + (range >> 16)*fineCos(angle),
    source.y + (range >> 16)*fineSin(angle), attackMap, true, true, intercept => {
      const distance = Math.max(1, fixedMul(range,intercept.frac));
      if (intercept.isLine) {
        const line = attackMap!.linedefs[intercept.lineIdx];
        if (line.left < 0) return false;
        const opening = lineOpening(intercept.lineIdx,attackMap!);
        if (!opening || opening.openBottom >= opening.openTop) return false;
        const a=attackMap!.sectors[attackMap!.sidedefs[line.right].sector];
        const b=attackMap!.sectors[attackMap!.sidedefs[line.left].sector];
        if (a.floorHeight!==b.floorHeight) bottom=Math.max(bottom,fixedDiv(opening.openBottom-shootZ,distance));
        if (a.ceilingHeight!==b.ceilingHeight) top=Math.min(top,fixedDiv(opening.openTop-shootZ,distance));
        return top > bottom;
      }
      const thing=intercept.thing;
      if (!thing || thing===source || !(thing.flags & MF_SHOOTABLE) || thing.health<=0) return true;
      const hi=fixedDiv(thing.z+thing.height-shootZ,distance), lo=fixedDiv(thing.z-shootZ,distance);
      if (hi<bottom || lo>top) return true;
      result.slope=Math.trunc((Math.min(hi,top)+Math.max(lo,bottom))/2);
      result.target=thing;
      return false;
    });
  return result;
}

/**
 * Fire a hitscan from a source position.
 * angle: radians (Doom-space, 0 = east, pi/2 = north)
 * slope: vertical aim slope (fixed-point, 0 = horizontal)
 * range: maximum distance (fixed-point)
 * damage: damage to apply on hit
 */
export function lineAttack(
  sourceX: Fixed, sourceY: Fixed, sourceZ: Fixed,
  angle: number,
  slope: Fixed,
  range: Fixed,
  damage: number,
  sourceMobj: Mobj | null
): void {

  if ( ! attackMap ) return;

  const cosA = fineCos(angle);
  const sinA = fineSin(angle);

  const x2 = sourceX + cosA * (range >> 16);
  const y2 = sourceY + sinA * (range >> 16);

  // Shoot from source eye height (center + 8 units for player-like height)
  const shootZ = sourceZ;
  const impact=(frac:number,offset:number,blood:boolean)=>{
    const closer=frac-fixedDiv(offset*FRACUNIT,range);
    const x=sourceX+fixedMul(x2-sourceX,closer),y=sourceY+fixedMul(y2-sourceY,closer);
    const z=shootZ+fixedMul(slope,fixedMul(closer,range));
    return {x,y,z,blood};
  };
  const wallImpact=(frac:number,lineIdx:number)=>{
    const line=attackMap!.linedefs[lineIdx],hit=impact(frac,4,false);
    const front=attackMap!.sectors[attackMap!.sidedefs[line.right].sector];
    const back=line.left<0?null:attackMap!.sectors[attackMap!.sidedefs[line.left].sector];
    if(front.ceilingTex==='F_SKY1'&&(hit.z>intToFixed(front.ceilingHeight)||back?.ceilingTex==='F_SKY1'))return false;
    spawnHitEffect(hit.x,hit.y,hit.z,damage,false,range===64*FRACUNIT);
    return false;
  };

  pathTraverse( sourceX, sourceY, x2, y2, attackMap, true, true,

    ( intercept: Intercept ): boolean => {

      if ( intercept.isLine ) {

        const line = attackMap!.linedefs[ intercept.lineIdx ];

        if(line.special)shootSpecialLine(line,attackMap!,sourceMobj?.type==='MT_PLAYER');

        // One-sided line — solid wall, stop
        if ( line.left < 0 ) return wallImpact(intercept.frac,intercept.lineIdx);

        // Two-sided line — check opening
        const opening = lineOpening( intercept.lineIdx, attackMap! );
        if ( ! opening ) return false;

        const dist = Math.max( FRACUNIT, fixedMul( range, intercept.frac ) );

        // Check if slope hits the floor step
        const frontSec = attackMap!.sectors[ attackMap!.sidedefs[ line.right ].sector ];
        const backSec = attackMap!.sectors[ attackMap!.sidedefs[ line.left ].sector ];

        if ( frontSec.floorHeight !== backSec.floorHeight ) {

          const floorSlope = fixedDiv( opening.openBottom - shootZ, dist );
          if ( floorSlope > slope ) return wallImpact(intercept.frac,intercept.lineIdx); // hits floor step

        }

        // Check if slope hits the ceiling step
        if ( frontSec.ceilingHeight !== backSec.ceilingHeight ) {

          const ceilSlope = fixedDiv( opening.openTop - shootZ, dist );
          if ( ceilSlope < slope ) return wallImpact(intercept.frac,intercept.lineIdx); // hits ceiling step

        }

        // Gap is open enough — bullet passes through
        return true;

      }

      // --- Thing intercept ---
      const thing = intercept.thing;
      if ( ! thing || thing === sourceMobj ) return true; // skip self

      // Check vertical hit: does the slope pass through this thing's body?
      const dist = Math.max( FRACUNIT, fixedMul( range, intercept.frac ) );

      const thingTopSlope = fixedDiv( thing.z + thing.height - shootZ, dist );
      if ( thingTopSlope < slope ) return true; // bullet goes over

      const thingBottomSlope = fixedDiv( thing.z - shootZ, dist );
      if ( thingBottomSlope > slope ) return true; // bullet goes under

      // PTR_ShootTraverse spawns the effect before damage consumes RNG.
      const hit=impact(intercept.frac,10,!(thing.flags&MF_NOBLOOD));
      spawnHitEffect(hit.x,hit.y,hit.z,damage,hit.blood,range===64*FRACUNIT);
      // Hit! Apply damage
      if ( damage > 0 ) {

        damageMobj( thing, sourceMobj, sourceMobj, damage );

      }

      return false; // stop traversal

    }

  );

}

// ============================================================
// P_DamageMobj — ported from p_inter.c
// Handles damage for both monsters and the player.
// ============================================================

const BASETHRESHOLD = 100;
let killCallback: ((mo: Mobj) => void) | null = null;
export function setKillCallback(cb: (mo: Mobj) => void): void { killCallback = cb; }

// Player damage callback — set from main.ts
// Called when the target mobj IS the player, so we can apply armor/HUD/death.
let playerDamageMobjCallback: ( ( damage: number, inflictor: Mobj | null, source: Mobj | null ) => void ) | null = null;

export function setPlayerDamageMobjCallback(
  cb: ( damage: number, inflictor: Mobj | null, source: Mobj | null ) => void
): void {

  playerDamageMobjCallback = cb;

}

export function damageMobj(
  target: Mobj,
  inflictor: Mobj | null,
  source: Mobj | null,
  damage: number
): void {

  if ( ! ( target.flags & MF_SHOOTABLE ) ) return;
  if ( target.health <= 0 ) return;

  // Stop skull-fly momentum on any hit
  if ( ( target.flags & MF_SKULLFLY ) !== 0 ) {

    target.momx = 0;
    target.momy = 0;
    target.momz = 0;

  }

  // Thrust / knockback from damage
  if ( inflictor && damage > 0 ) {

    const angle = pointToRadians(target.x - inflictor.x,target.y - inflictor.y);
    let thrust = Math.trunc( ( damage * ( FRACUNIT >> 3 ) * 100 ) / Math.max( 1, target.info.mass ) );

    target.momx += fixedMul(thrust,fineCos(angle));
    target.momy += fixedMul(thrust,fineSin(angle));

  }

  // If the target is the player mobj, delegate to player damage system
  if ( target.type === 'MT_PLAYER' && playerDamageMobjCallback ) {

    playerDamageMobjCallback( damage, inflictor, source );
    return;

  }

  // --- Monster damage path ---
  target.health -= damage;

  if ( target.health <= 0 ) {

    killCallback?.(target);
    killMobj( source, target );
    return;

  }

  // Pain state
  if ( target.info.painState && target.info.painChance > 0 ) {

    if ( ( target.flags & MF_SKULLFLY ) === 0 && P_Random() < target.info.painChance ) {

      target.flags |= MF_JUSTHIT; // fight back immediately
      setMobjState( target, target.info.painState );

    }

  }

  target.reactionTime = 0; // wake up immediately

  // Infighting: switch target to attacker (with threshold check)
  if ( ( ! target.threshold || target.type === 'MT_VILE' ) &&
       source && source !== target && source.type !== 'MT_VILE' ) {

    target.target = source;
    target.threshold = BASETHRESHOLD;

    // If in spawn (idle) state, switch to see state
    if ( target.state === target.info.spawnState && target.info.seeState ) {

      setMobjState( target, target.info.seeState );

    }

  }

}

// ============================================================
// P_KillMobj — ported from p_inter.c
// ============================================================

function killMobj( source: Mobj | null, target: Mobj ): void {

  target.flags &= ~( MF_SHOOTABLE | MF_FLOAT | MF_SKULLFLY );
  if (target.type !== 'MT_SKULL') target.flags &= ~MF_NOGRAVITY;
  if (target.type === 'MT_PLAYER') target.flags &= ~MF_SOLID;
  target.flags |= MF_CORPSE | MF_DROPOFF;
  target.height = target.height >> 2; // reduce height to 25%

  // Overkill: health < -spawnHealth AND has xDeathState
  const overkill = target.health < - target.info.spawnHealth && target.info.xDeathState;

  setMobjState( target, overkill ? target.info.xDeathState! : target.info.deathState );

  // Randomize tics slightly
  target.tics -= P_Random() & 3;
  if ( target.tics < 1 ) target.tics = 1;

  // Death-state actions own the sound; playing it here duplicates A_Scream.
  const item = target.type === 'MT_POSSESSED' || target.type === 'MT_WOLFSS' ? 'MT_CLIP'
    : target.type === 'MT_SHOTGUY' ? 'MT_SHOTGUN'
    : target.type === 'MT_CHAINGUY' ? 'MT_CHAINGUN' : null;
  if (item) {
    const dropped = spawnMobj(target.x, target.y, target.floorz, item);
    dropped.flags |= MF_DROPPED;
  }

}

// ============================================================
// A_Explode — called by barrel death animation
// ============================================================

function A_Explode( mo: Mobj ): void {

  radiusAttack( mo, mo.target, 128 );

}

// ============================================================
// P_RadiusAttack — ported from p_map.c
// Uses P_CheckSight (BSP) for explosion LOS instead of the old
// simplified checkLOS that only checked one-sided lines.
// ============================================================

export function radiusAttack(
  spot: Mobj,
  source: Mobj | null,
  damage: number
): void {

  if ( ! attackMap ) return;

  // Search all mobjs within range
  for ( const mo of allMobjs ) {

    if ( mo.removed ) continue;
    if ( ! ( mo.flags & MF_SHOOTABLE ) ) continue;
    // PIT_RadiusAttack: these bosses are immune to splash, not direct hits.
    if (mo.type === 'MT_CYBORG' || mo.type === 'MT_SPIDER') continue;

    // Chebyshev distance (max of abs X/Y deltas)
    const dx = Math.abs( mo.x - spot.x );
    const dy = Math.abs( mo.y - spot.y );
    let dist = ( dx > dy ? dx : dy ) >> FRACBITS;

    // Subtract target radius
    dist -= mo.radius >> FRACBITS;
    if ( dist < 0 ) dist = 0;

    // Out of range?
    if ( dist >= damage ) continue;

    // Check line-of-sight (walls block explosions) — use proper BSP sight check
    if ( ! P_CheckSight( mo, spot, attackMap ) ) continue;

    // Apply damage with distance falloff
    damageMobj( mo, spot, source, damage - dist );

  }

}

// p_pspr.c A_BFGSpray: trace forty rays from the shooter, not the projectile.
// Each acquired target takes the sum of fifteen independent 1..8 rolls.
export function A_BFGSpray(missile: Mobj): void {
  const source = missile.target;
  if (!source) return;
  for (let i = 0; i < 40; i++) {
    const angle = missile.angle - Math.PI / 4 + (Math.PI / 2) * i / 40;
    const target = aimLineAttack(source, angle, 1024 * FRACUNIT).target;
    if (!target) continue;
    spawnMobj(target.x, target.y, target.z + (target.height >> 2), 'MT_EXTRABFG');
    let damage = 0;
    for (let roll = 0; roll < 15; roll++) damage += (P_Random() & 7) + 1;
    damageMobj(target, source, source, damage);
  }
}
