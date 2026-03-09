// Hitscan attack, damage, and radius attack — ported from p_map.c / p_inter.c.
// Implements P_LineAttack (bullet tracing), P_DamageMobj, and P_RadiusAttack.

import type { Fixed } from '../math/fixed';
import { FRACUNIT, FRACBITS, intToFixed, fixedToFloat, fixedMul, fixedDiv, floatToFixed } from '../math/fixed';
import type { DoomMapData, DoomPlayer } from '../physics/DoomMovement';
import { findSectorAtFixed } from '../physics/DoomMovement';
import type { Mobj } from './Mobj';
import { allMobjs, setMobjState, spawnMobj, setExplodeCallback } from './Mobj';
import { MF_SHOOTABLE, MF_NOBLOOD, MF_SOLID, MF_CORPSE, MF_SKULLFLY, MF_JUSTHIT } from './MobjData';
import { P_Random } from './DoomRandom';
import { playSound } from '../sound';
import type { PlayerStatusState } from '../ecs/traits';

// ============================================================
// Constants
// ============================================================

const MISSILERANGE = ( 32 * 64 ) * FRACUNIT; // 2048 map units
const MELEERANGE = 64 * FRACUNIT;
const MAXRADIUS = 32 * FRACUNIT;

// ============================================================
// Init — register A_Explode callback
// ============================================================

export function initAttackSystem(): void {

  setExplodeCallback( A_Explode );

}

// ============================================================
// P_LineAttack — fire a hitscan ray from (x, y, z) at angle/slope
// ============================================================

let attackMap: DoomMapData | null = null;

export function setAttackMap( map: DoomMapData ): void {

  attackMap = map;

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

  const cosA = Math.cos( angle );
  const sinA = Math.sin( angle );

  // Step along the ray in small increments testing for mobj hits
  // This is a simplified version — original Doom uses P_PathTraverse with
  // intercept sorting. For now we check all shootable mobjs by distance.

  let bestDist = range;
  let bestMobj: Mobj | null = null;

  for ( const mo of allMobjs ) {

    if ( mo.removed ) continue;
    if ( ! ( mo.flags & MF_SHOOTABLE ) ) continue;
    if ( mo.health <= 0 ) continue;

    // Vector from source to mobj center
    const dx = mo.x - sourceX;
    const dy = mo.y - sourceY;

    // Project onto ray direction (dot product)
    const dot = fixedMul( dx, floatToFixed( cosA ) ) + fixedMul( dy, floatToFixed( sinA ) );

    // Must be in front of us and within range
    if ( dot <= 0 || dot > bestDist ) continue;

    // Perpendicular distance from ray to mobj center
    const perp = Math.abs( fixedMul( dx, floatToFixed( - sinA ) ) + fixedMul( dy, floatToFixed( cosA ) ) );

    // Hit if perpendicular distance < radius
    if ( perp > mo.radius ) continue;

    // Check vertical: compute ray Z at this distance
    const rayZ = sourceZ + fixedMul( slope, dot );
    if ( rayZ < mo.z || rayZ > mo.z + mo.height ) continue;

    // Check line-of-sight isn't blocked by a wall
    if ( ! checkLOS( sourceX, sourceY, mo.x, mo.y, attackMap ) ) continue;

    bestDist = dot;
    bestMobj = mo;

  }

  if ( bestMobj ) {

    // Hit a thing
    damageMobj( bestMobj, sourceMobj, sourceMobj, damage );

  } else {

    // Hit a wall — spawn puff at endpoint
    // (We could trace to find the exact wall hit point, but for now
    // just let the bullet disappear — puff spawning is visual-only)

  }

}

// ============================================================
// Simple LOS check — test if a straight line between two points
// crosses any one-sided linedef (wall).
// ============================================================

function checkLOS(
  x1: Fixed, y1: Fixed,
  x2: Fixed, y2: Fixed,
  map: DoomMapData
): boolean {

  const { vertexes, linedefs, blockmap } = map;

  // Compute blockmap bounds for the line
  const fx1 = x1 >> FRACBITS;
  const fy1 = y1 >> FRACBITS;
  const fx2 = x2 >> FRACBITS;
  const fy2 = y2 >> FRACBITS;

  const minX = Math.min( fx1, fx2 );
  const maxX = Math.max( fx1, fx2 );
  const minY = Math.min( fy1, fy2 );
  const maxY = Math.max( fy1, fy2 );

  const colMin = Math.max( 0, Math.floor( ( minX - blockmap.originX ) / blockmap.blockSize ) );
  const colMax = Math.min( blockmap.columns - 1, Math.floor( ( maxX - blockmap.originX ) / blockmap.blockSize ) );
  const rowMin = Math.max( 0, Math.floor( ( minY - blockmap.originY ) / blockmap.blockSize ) );
  const rowMax = Math.min( blockmap.rows - 1, Math.floor( ( maxY - blockmap.originY ) / blockmap.blockSize ) );

  // Ray direction
  const rdx = x2 - x1;
  const rdy = y2 - y1;

  for ( let row = rowMin; row <= rowMax; row ++ ) {

    for ( let col = colMin; col <= colMax; col ++ ) {

      const idx = row * blockmap.columns + col;
      const list = blockmap.lists[ idx ];

      for ( const ldIdx of list ) {

        const ld = linedefs[ ldIdx ];

        // Only one-sided lines block sight
        if ( ld.left >= 0 ) continue;

        const v1 = vertexes[ ld.v1 ];
        const v2 = vertexes[ ld.v2 ];

        const lx1 = intToFixed( v1.x );
        const ly1 = intToFixed( v1.y );
        const ldx = intToFixed( v2.x ) - lx1;
        const ldy = intToFixed( v2.y ) - ly1;

        // Check if the ray (x1,y1)→(x2,y2) crosses this line segment
        // Using cross products for segment intersection test
        const d1 = crossProduct( rdx, rdy, lx1 - x1, ly1 - y1 );
        const d2 = crossProduct( rdx, rdy, lx1 + ldx - x1, ly1 + ldy - y1 );

        if ( ( d1 > 0 ) === ( d2 > 0 ) ) continue; // same side

        const d3 = crossProduct( ldx, ldy, x1 - lx1, y1 - ly1 );
        const d4 = crossProduct( ldx, ldy, x2 - lx1, y2 - ly1 );

        if ( ( d3 > 0 ) === ( d4 > 0 ) ) continue; // same side

        // Segments cross — line of sight blocked
        return false;

      }

    }

  }

  return true;

}

/** Cross product of 2D vectors (scaled down to avoid overflow) */
function crossProduct( ax: Fixed, ay: Fixed, bx: Fixed, by: Fixed ): number {

  return ( ax / FRACUNIT ) * ( by / FRACUNIT ) - ( ay / FRACUNIT ) * ( bx / FRACUNIT );

}

// ============================================================
// P_DamageMobj — ported from p_inter.c
// Handles damage for both monsters and the player.
// ============================================================

const BASETHRESHOLD = 100;

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

    const angle = Math.atan2( target.y - inflictor.y, target.x - inflictor.x );
    let thrust = Math.trunc( ( damage * ( FRACUNIT >> 3 ) * 100 ) / Math.max( 1, target.info.mass ) );

    target.momx += Math.round( thrust * Math.cos( angle ) );
    target.momy += Math.round( thrust * Math.sin( angle ) );

  }

  // If the target is the player mobj, delegate to player damage system
  if ( target.type === 'MT_PLAYER' && playerDamageMobjCallback ) {

    playerDamageMobjCallback( damage, inflictor, source );
    return;

  }

  // --- Monster damage path ---
  target.health -= damage;

  if ( target.health <= 0 ) {

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

  target.flags &= ~( MF_SHOOTABLE | MF_SOLID | MF_SKULLFLY );
  target.flags |= MF_CORPSE;
  target.height = target.height >> 2; // reduce height to 25%

  // Overkill: health < -spawnHealth AND has xDeathState
  const overkill = target.health < - target.info.spawnHealth && target.info.xDeathState;

  setMobjState( target, overkill ? target.info.xDeathState! : target.info.deathState );

  // Randomize tics slightly
  target.tics -= P_Random() & 3;
  if ( target.tics < 1 ) target.tics = 1;

  // Play death sound
  if ( target.info.deathSound ) {

    playSound( target.info.deathSound );

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

    // Chebyshev distance (max of abs X/Y deltas)
    const dx = Math.abs( mo.x - spot.x );
    const dy = Math.abs( mo.y - spot.y );
    let dist = ( dx > dy ? dx : dy ) >> FRACBITS;

    // Subtract target radius
    dist -= mo.radius >> FRACBITS;
    if ( dist < 0 ) dist = 0;

    // Out of range?
    if ( dist >= damage ) continue;

    // Check line-of-sight (walls block explosions)
    if ( ! checkLOS( mo.x, mo.y, spot.x, spot.y, attackMap ) ) continue;

    // Apply damage with distance falloff
    damageMobj( mo, spot, source, damage - dist );

  }

  // Also damage the player if in range
  if ( playerDamageCallback ) {

    playerDamageCallback( spot, source, damage );

  }

}

// ============================================================
// Player damage callback — set from main.ts
// ============================================================

let playerDamageCallback: ( ( spot: Mobj, source: Mobj | null, damage: number ) => void ) | null = null;

export function setPlayerDamageCallback(
  cb: ( spot: Mobj, source: Mobj | null, damage: number ) => void
): void {

  playerDamageCallback = cb;

}
