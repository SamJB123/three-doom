import {fineSin,fineCos,pointToRadians,radiansToAngle,angleToRadians} from '../math/angles';
// Enemy AI system — ported from p_enemy.c.
// Handles monster behavior: idle scanning, chase pursuit, attack actions,
// movement direction calculation, and sound propagation.

import type { Fixed } from '../math/fixed';
import { FRACUNIT, FRACBITS, fixedMul, fixedDiv, intToFixed, fixedToFloat } from '../math/fixed';
import type { DoomMapData } from '../physics/DoomMovement';
import { findSectorAtFixed, tryMove, specialContacts, moveOpening } from '../physics/DoomMovement';
import type { Mobj } from './Mobj';
import { allMobjs, spawnMobj, spawnMissile as P_SpawnMissile, setMobjState, removeMobj, setEnemyActionCallback, getMobjMapData } from './Mobj';
import { MF_SHOOTABLE, MF_SOLID, MF_AMBUSH, MF_JUSTHIT, MF_JUSTATTACKED, MF_SKULLFLY,
  MF_SHADOW, MF_FLOAT, MF_INFLOAT, MF_CORPSE, MF_MISSILE, MF_NOGRAVITY, MF_COUNTKILL } from './MobjData';
import { P_CheckSight } from './Sight';
import { aimLineAttack, lineAttack, damageMobj, radiusAttack } from './Attack';
import { P_Random } from './DoomRandom';
import { gameRules } from './GameRules';
import { evDoFloor } from './Floors';
import { requestExit } from './UseAction';
import { evDoDoor, evVerticalDoor } from './Doors';
import { playSound, playSoundAt } from '../sound';

// ============================================================
// Constants
// ============================================================

const MISSILERANGE = ( 32 * 64 ) * FRACUNIT; // 2048 map units
const MELEERANGE = 64 * FRACUNIT;
const SKULLSPEED = 20 * FRACUNIT;
const FATSPREAD = Math.PI / 8; // ANG90/8 in radians

// ============================================================
// Direction enumeration
// ============================================================

const DI_EAST      = 0;
const DI_NORTHEAST = 1;
const DI_NORTH     = 2;
const DI_NORTHWEST = 3;
const DI_WEST      = 4;
const DI_SOUTHWEST = 5;
const DI_SOUTH     = 6;
const DI_SOUTHEAST = 7;
const DI_NODIR     = 8;

const opposite = [
  DI_WEST, DI_SOUTHWEST, DI_SOUTH, DI_SOUTHEAST,
  DI_EAST, DI_NORTHEAST, DI_NORTH, DI_NORTHWEST,
  DI_NODIR
];

const diags = [
  DI_NORTHWEST, DI_NORTHEAST, DI_SOUTHWEST, DI_SOUTHEAST
];

// Movement speed tables (fixed-point unit vectors)
const xspeed: readonly number[] = [ FRACUNIT, 47000, 0, -47000, -FRACUNIT, -47000, 0, 47000 ];
const yspeed: readonly number[] = [ 0, 47000, FRACUNIT, 47000, 0, -47000, -FRACUNIT, -47000 ];

// Direction angles in radians
const dirAngles: readonly number[] = [
  0,                  // east
  Math.PI / 4,        // northeast
  Math.PI / 2,        // north
  3 * Math.PI / 4,    // northwest
  Math.PI,            // west
  5 * Math.PI / 4,    // southwest
  3 * Math.PI / 2,    // south
  7 * Math.PI / 4     // southeast
];

// ============================================================
// Player reference — set via setPlayerMobj()
// ============================================================

let playerMobj: Mobj | null = null;
let gameTic = 0;

export function setPlayerMobj( mo: Mobj ): void {

  playerMobj = mo;

}

/** Advance game tic counter (for tracer timing) */
export function advanceEnemyTic(): void {

  gameTic ++;

}

// ============================================================
// Utility
// ============================================================

function approxDistance( dx: Fixed, dy: Fixed ): Fixed {

  let adx = Math.abs( dx );
  let ady = Math.abs( dy );

  if ( adx < ady ) return adx + ady - ( ( adx / 2 ) | 0 );
  return adx + ady - ( ( ady / 2 ) | 0 );

}

function angleTo( sx: Fixed, sy: Fixed, tx: Fixed, ty: Fixed ): number {

  const dx = tx - sx;
  const dy = ty - sy;
  return pointToRadians(dx,dy);

}

/** Normalize angle to [0, 2*PI) */
function normalizeAngle( a: number ): number {

  a = a % ( 2 * Math.PI );
  if ( a < 0 ) a += 2 * Math.PI;
  return a;

}

// ============================================================
// P_CheckMeleeRange
// ============================================================

export function P_CheckMeleeRange( mo: Mobj ): boolean {

  const target = mo.target;
  if ( ! target ) return false;

  const dist = approxDistance( target.x - mo.x, target.y - mo.y );
  if ( dist >= MELEERANGE - 20 * FRACUNIT + target.radius ) return false;

  const map = getMobjMapData();
  if ( ! map ) return false;

  return P_CheckSight( mo, target, map );

}

// ============================================================
// P_CheckMissileRange
// ============================================================

export function P_CheckMissileRange( mo: Mobj, map: DoomMapData ): boolean {

  if ( ! mo.target ) return false;
  if ( ! P_CheckSight( mo, mo.target, map ) ) return false;

  if ( ( mo.flags & MF_JUSTHIT ) !== 0 ) {

    mo.flags &= ~MF_JUSTHIT;
    return true;

  }

  if ( mo.reactionTime > 0 ) return false;

  let dist = ( approxDistance( mo.x - mo.target.x, mo.y - mo.target.y ) - 64 * FRACUNIT ) >> FRACBITS;

  if ( ! mo.info.meleeState ) {

    dist -= 128;

  }

  if ( mo.type === 'MT_VILE' && dist > 14 * 64 ) return false;

  if ( mo.type === 'MT_UNDEAD' ) {

    if ( dist < 196 ) return false;
    dist >>= 1;

  }

  if ( mo.type === 'MT_CYBORG' || mo.type === 'MT_SPIDER' || mo.type === 'MT_SKULL' ) {

    dist >>= 1;

  }

  if ( dist > 200 ) dist = 200;

  if ( mo.type === 'MT_CYBORG' && dist > 160 ) dist = 160;

  return P_Random() >= dist;

}

// ============================================================
// P_Move — try to move monster in its current moveDir
// ============================================================

export function P_Move( mo: Mobj, map: DoomMapData ): boolean {

  if ( mo.moveDir === DI_NODIR ) return false;

  const speed = mo.info.speed;
  // Monster speed is an integer map-unit count; direction vectors are already
  // fixed-point. P_Move uses ordinary multiplication, unlike projectile speed.
  const tryX = (mo.x + speed * xspeed[ mo.moveDir ]) | 0;
  const tryY = (mo.y + speed * yspeed[ mo.moveDir ]) | 0;

  if (!tryMove(mo, tryX, tryY, map)) {
    const opening = moveOpening();
    if ((mo.flags & MF_FLOAT) && opening.floatok) {
      mo.z += mo.z < opening.floor ? 4 * FRACUNIT : -4 * FRACUNIT;
      mo.flags |= MF_INFLOAT;
      return true;
    }
    const contacts = specialContacts();
    if (!contacts.length) return false;
    mo.moveDir = DI_NODIR;
    let accepted = false;
    for (const idx of contacts.reverse()) {
      const line = map.linedefs[idx];
      // P_UseSpecialLine accepts these monster uses, even when a locked
      // EV_VerticalDoor cannot open. Secret doors are never monster-usable.
      if(!(line.flags&32)&&[1,32,33,34].includes(line.special)){
        evVerticalDoor(line,map.linedefs,map.sidedefs,map.sectors,undefined,false);accepted=true;
      }
    }
    return accepted;
  }
  mo.flags &= ~MF_INFLOAT;
  if (!(mo.flags & MF_FLOAT)) mo.z = mo.floorz;

  return true;

}

// ============================================================
// P_TryWalk
// ============================================================

function P_TryWalk( mo: Mobj, map: DoomMapData ): boolean {

  if ( ! P_Move( mo, map ) ) return false;
  mo.movecount = P_Random() & 15;
  return true;

}

// ============================================================
// P_NewChaseDir — calculate new movement direction toward target
// ============================================================

export function P_NewChaseDir( mo: Mobj ): void {

  if ( ! mo.target ) return;

  const map = getMobjMapData();
  if ( ! map ) return;

  const deltax = mo.target.x - mo.x;
  const deltay = mo.target.y - mo.y;
  const olddir = mo.moveDir;
  const turnaround = opposite[ olddir ] ?? DI_NODIR;

  const d: number[] = [ DI_NODIR, DI_NODIR, DI_NODIR ];

  d[ 1 ] = deltax > 10 * FRACUNIT ? DI_EAST :
            deltax < -10 * FRACUNIT ? DI_WEST : DI_NODIR;

  d[ 2 ] = deltay > 10 * FRACUNIT ? DI_NORTH :
            deltay < -10 * FRACUNIT ? DI_SOUTH : DI_NODIR;

  // Try diagonal first
  if ( d[ 1 ] !== DI_NODIR && d[ 2 ] !== DI_NODIR ) {

    mo.moveDir = diags[ ( ( deltay < 0 ? 1 : 0 ) << 1 ) + ( deltax > 0 ? 1 : 0 ) ];

    if ( mo.moveDir !== turnaround && P_TryWalk( mo, map ) ) return;

  }

  // Randomly swap horizontal/vertical preference
  if ( P_Random() > 200 || Math.abs( deltay ) > Math.abs( deltax ) ) {

    const temp = d[ 1 ];
    d[ 1 ] = d[ 2 ];
    d[ 2 ] = temp;

  }

  if ( d[ 1 ] === turnaround ) d[ 1 ] = DI_NODIR;
  if ( d[ 2 ] === turnaround ) d[ 2 ] = DI_NODIR;

  // Try d[1], d[2], then old direction
  for ( const dir of [ d[ 1 ], d[ 2 ], olddir ] ) {

    if ( dir !== DI_NODIR ) {

      mo.moveDir = dir;
      if ( P_TryWalk( mo, map ) ) return;

    }

  }

  // Try all directions
  const range = ( P_Random() & 1 ) !== 0
    ? [ DI_EAST, DI_NORTHEAST, DI_NORTH, DI_NORTHWEST, DI_WEST, DI_SOUTHWEST, DI_SOUTH, DI_SOUTHEAST ]
    : [ DI_SOUTHEAST, DI_SOUTH, DI_SOUTHWEST, DI_WEST, DI_NORTHWEST, DI_NORTH, DI_NORTHEAST, DI_EAST ];

  for ( const dir of range ) {

    if ( dir === turnaround ) continue;
    mo.moveDir = dir;
    if ( P_TryWalk( mo, map ) ) return;

  }

  // Last resort — try the turnaround direction
  if ( turnaround !== DI_NODIR ) {

    mo.moveDir = turnaround;
    if ( P_TryWalk( mo, map ) ) return;

  }

  mo.moveDir = DI_NODIR;

}

// ============================================================
// A_FaceTarget
// ============================================================

export function A_FaceTarget( mo: Mobj ): void {

  if ( ! mo.target ) return;

  mo.flags &= ~MF_AMBUSH;
  mo.angle = angleTo( mo.x, mo.y, mo.target.x, mo.target.y );

  // Add randomness if target has partial invisibility
  if ( ( mo.target.flags & MF_SHADOW ) !== 0 ) {

    mo.angle += ( P_Random() - P_Random() ) * ( Math.PI / 1024 );

  }

}

// ============================================================
// A_Look — idle state scanning for player
// ============================================================

/** P_LookForPlayers, retaining the four-slot scan in single-player games. */
export function P_LookForPlayers(mo:Mobj,allAround:boolean,map:DoomMapData):boolean {
  if(!playerMobj)return false;
  const stop=(mo.lastLook-1)&3;let count=0;
  for(;;mo.lastLook=(mo.lastLook+1)&3){
    if(mo.lastLook!==0)continue;
    if(count++===2||mo.lastLook===stop)return false;
    if(playerMobj.health<=0||!P_CheckSight(mo,playerMobj,map))continue;
    if(!allAround){
      const delta=(radiansToAngle(angleTo(mo.x,mo.y,playerMobj.x,playerMobj.y))-radiansToAngle(mo.angle))>>>0;
      if(delta>0x40000000&&delta<0xc0000000&&approxDistance(playerMobj.x-mo.x,playerMobj.y-mo.y)>MELEERANGE)continue;
    }
    mo.target=playerMobj;return true;
  }
}

export function A_Look( mo: Mobj, map: DoomMapData ): void {

  mo.threshold = 0;

  const sector = findSectorAtFixed(mo.x, mo.y, map);
  const soundTarget = sector ? sectorSoundTarget.get(map.sectors.indexOf(sector)) : null;
  let heard=false;
  if(soundTarget&&(soundTarget.flags&MF_SHOOTABLE)){
    mo.target=soundTarget;
    heard=!(mo.flags&MF_AMBUSH)||P_CheckSight(mo,soundTarget,map);
  }
  if(!heard&&!P_LookForPlayers(mo,false,map))return;

  if ( mo.info.seeSound ) {

    playMonsterVoice(mo,mo.info.seeSound);

  }

  if ( mo.info.seeState ) {

    setMobjState( mo, mo.info.seeState );

  }

}

// ============================================================
// A_Chase — pursuit state
// ============================================================

export function A_Chase( mo: Mobj, map: DoomMapData ): void {

  if ( mo.reactionTime > 0 ) {

    mo.reactionTime --;

  }

  // Count down target threshold
  if ( mo.threshold > 0 ) {

    if ( ! mo.target || mo.target.health <= 0 ) {

      mo.threshold = 0;

    } else {

      mo.threshold --;

    }

  }

  // Turn toward movement direction
  if ( mo.moveDir < 8 ) {

    let angle=(radiansToAngle(mo.angle)&0xe0000000)>>>0;
    const delta=(angle-(mo.moveDir<<29))|0;
    if(delta>0)angle-=0x20000000;else if(delta<0)angle+=0x20000000;
    mo.angle=angleToRadians(angle);

  }

  // No target or target dead — look for players
  if ( ! mo.target || ( mo.target.flags & MF_SHOOTABLE ) === 0 ) {

    if ( P_LookForPlayers(mo,true,map) ) {
      return;

    } else {

      if ( mo.info.spawnState ) setMobjState( mo, mo.info.spawnState );
      return;

    }

  }

  // Just attacked — skip a tic
  if ( ( mo.flags & MF_JUSTATTACKED ) !== 0 ) {

    mo.flags &= ~MF_JUSTATTACKED;
    if(gameRules.skill!==5)P_NewChaseDir( mo );
    return;

  }

  // Melee attack check
  if ( mo.info.meleeState && P_CheckMeleeRange( mo ) ) {

    if ( mo.info.attackSound ) playSoundAt( mo.info.attackSound, mo.x, mo.y, mo.z, mo);
    setMobjState( mo, mo.info.meleeState );
    return;

  }

  // Missile attack check
  if ( mo.info.missileState ) {

    if ( (gameRules.skill===5 || mo.movecount===0) && P_CheckMissileRange( mo, map ) ) {

      setMobjState( mo, mo.info.missileState );
      mo.flags |= MF_JUSTATTACKED;
      return;

    }

  }

  // Chase — move toward target
  mo.movecount --;

  if ( mo.movecount < 0 || ! P_Move( mo, map ) ) {

    P_NewChaseDir( mo );

  }

  // Play active sound randomly
  if ( mo.info.activeSound && P_Random() < 3 ) {

    playSoundAt( mo.info.activeSound, mo.x, mo.y, mo.z, mo);

  }

}

// ============================================================
// Missile spawning — delegates to Mobj.ts P_SpawnMissile
// ============================================================

function spawnMissile( source: Mobj, dest: Mobj, typeName: string ): Mobj | null {

  return P_SpawnMissile( source, dest, typeName );

}

// ============================================================
// Monster attack actions
// ============================================================

export function A_PosAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );
  const slope=aimLineAttack(mo,mo.angle,MISSILERANGE).slope;

  playSoundAt( 'pistol', mo.x, mo.y, mo.z, mo);

  const angle = mo.angle + ( P_Random() - P_Random() ) * ( Math.PI / 2048 );
  const damage = ( ( P_Random() % 5 ) + 1 ) * 3;

  lineAttack(
    mo.x, mo.y, mo.z + (mo.height>>1) + 8 * FRACUNIT,
    angle, slope, MISSILERANGE, damage, mo
  );

}

export function A_SPosAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;

  playSoundAt( 'shotgn', mo.x, mo.y, mo.z, mo);
  A_FaceTarget( mo );
  const slope=aimLineAttack(mo,mo.angle,MISSILERANGE).slope;

  for ( let i = 0; i < 3; i ++ ) {

    const angle = mo.angle + ( P_Random() - P_Random() ) * ( Math.PI / 2048 );
    const damage = ( ( P_Random() % 5 ) + 1 ) * 3;

    lineAttack(
      mo.x, mo.y, mo.z + (mo.height>>1) + 8 * FRACUNIT,
      angle, slope, MISSILERANGE, damage, mo
    );

  }

}

export function A_CPosAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;

  playSoundAt( 'shotgn', mo.x, mo.y, mo.z, mo);
  A_FaceTarget( mo );
  const slope=aimLineAttack(mo,mo.angle,MISSILERANGE).slope;

  const angle = mo.angle + ( P_Random() - P_Random() ) * ( Math.PI / 2048 );
  const damage = ( ( P_Random() % 5 ) + 1 ) * 3;

  lineAttack(
    mo.x, mo.y, mo.z + (mo.height>>1) + 8 * FRACUNIT,
    angle, slope, MISSILERANGE, damage, mo
  );

}

export function A_CPosRefire( mo: Mobj ): void {

  A_FaceTarget( mo );

  if ( P_Random() < 40 ) return;

  const map = getMobjMapData();

  if ( ! mo.target || mo.target.health <= 0 ||
       ( map && ! P_CheckSight( mo, mo.target, map ) ) ) {

    if ( mo.info.seeState ) setMobjState( mo, mo.info.seeState );

  }

}

export function A_SpidRefire( mo: Mobj ): void {

  A_FaceTarget( mo );

  if ( P_Random() < 10 ) return;

  const map = getMobjMapData();

  if ( ! mo.target || mo.target.health <= 0 ||
       ( map && ! P_CheckSight( mo, mo.target, map ) ) ) {

    if ( mo.info.seeState ) setMobjState( mo, mo.info.seeState );

  }

}

export function A_TroopAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );

  if ( P_CheckMeleeRange( mo ) ) {

    playSoundAt( 'claw', mo.x, mo.y, mo.z, mo);
    const damage = ( P_Random() % 8 + 1 ) * 3;
    damageMobj( mo.target, mo, mo, damage );
    return;

  }

  spawnMissile( mo, mo.target, 'MT_TROOPSHOT' );

}

export function A_SargAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );

  if ( P_CheckMeleeRange( mo ) ) {

    const damage = ( P_Random() % 10 + 1 ) * 4;
    damageMobj( mo.target, mo, mo, damage );

  }

}

export function A_HeadAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );

  if ( P_CheckMeleeRange( mo ) ) {

    const damage = ( P_Random() % 6 + 1 ) * 10;
    damageMobj( mo.target, mo, mo, damage );
    return;

  }

  spawnMissile( mo, mo.target, 'MT_HEADSHOT' );

}

export function A_BruisAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;

  if ( P_CheckMeleeRange( mo ) ) {

    playSoundAt( 'claw', mo.x, mo.y, mo.z, mo);
    const damage = ( P_Random() % 8 + 1 ) * 10;
    damageMobj( mo.target, mo, mo, damage );
    return;

  }

  spawnMissile( mo, mo.target, 'MT_BRUISERSHOT' );

}

export function A_SkullAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;

  mo.flags |= MF_SKULLFLY;

  if ( mo.info.attackSound ) playSoundAt( mo.info.attackSound, mo.x, mo.y, mo.z, mo);

  A_FaceTarget( mo );

  const angle = mo.angle;
  mo.momx = fixedMul( SKULLSPEED, fineCos(angle) );
  mo.momy = fixedMul( SKULLSPEED, fineSin(angle) );

  let dist = ( approxDistance( mo.target.x - mo.x, mo.target.y - mo.y ) / SKULLSPEED ) | 0;
  if ( dist < 1 ) dist = 1;

  mo.momz = ( ( mo.target.z + ( mo.target.height >> 1 ) - mo.z ) / dist ) | 0;

}

export function A_CyberAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );
  spawnMissile( mo, mo.target, 'MT_ROCKET' );

}

export function A_BspiAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );
  spawnMissile( mo, mo.target, 'MT_ARACHPLAZ' );

}

export function A_SkelMissile( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );

  mo.z += 16 * FRACUNIT;
  const missile = spawnMissile( mo, mo.target, 'MT_TRACER' );
  mo.z -= 16 * FRACUNIT;

  if ( ! missile ) return;

  missile.x += missile.momx;
  missile.y += missile.momy;
  missile.tracer = mo.target;

}

export function A_SkelWhoosh( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );
  playSoundAt( 'skeswg', mo.x, mo.y, mo.z, mo);

}

export function A_SkelFist( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );

  if ( P_CheckMeleeRange( mo ) ) {

    playSoundAt( 'skepch', mo.x, mo.y, mo.z, mo);
    const damage = ( P_Random() % 10 + 1 ) * 6;
    damageMobj( mo.target, mo, mo, damage );

  }

}

export function A_Tracer( mo: Mobj ): void {

  // Only adjust course every 4th tic
  if ( ( gameTic & 3 ) !== 0 ) return;

  // Spawn smoke trail
  spawnMobj( mo.x, mo.y, mo.z, 'MT_PUFF' );

  const dest = mo.tracer;
  if ( ! dest || dest.health <= 0 ) return;

  // Adjust angle toward target
  const exact = angleTo( mo.x, mo.y, dest.x, dest.y );
  const TRACE_STEP = Math.PI / 32; // ~0x0c000000 in BAM → radians

  let angleDiff = normalizeAngle( exact - mo.angle );
  if ( angleDiff > Math.PI ) {

    // Turn clockwise
    mo.angle -= TRACE_STEP;
    if ( normalizeAngle( exact - mo.angle ) < Math.PI ) mo.angle = exact;

  } else {

    // Turn counter-clockwise
    mo.angle += TRACE_STEP;
    if ( normalizeAngle( exact - mo.angle ) > Math.PI ) mo.angle = exact;

  }

  mo.angle = normalizeAngle( mo.angle );

  // Update velocity from new angle
  const speed = mo.info.speed;
  mo.momx = fixedMul( speed, fineCos(mo.angle) );
  mo.momy = fixedMul( speed, fineSin(mo.angle) );

  // Adjust vertical speed
  let dist = approxDistance( dest.x - mo.x, dest.y - mo.y );
  dist = ( dist / Math.max( 1, speed ) ) | 0;
  if ( dist < 1 ) dist = 1;

  const slope = ( ( dest.z + 40 * FRACUNIT - mo.z ) / dist ) | 0;

  if ( slope < mo.momz ) {

    mo.momz -= ( FRACUNIT / 8 ) | 0;

  } else {

    mo.momz += ( FRACUNIT / 8 ) | 0;

  }

}

// ============================================================
// Mancubus attacks — three spread missile volleys
// ============================================================

export function A_FatRaise( mo: Mobj ): void {

  A_FaceTarget( mo );
  playSoundAt( 'manatk', mo.x, mo.y, mo.z, mo);

}

export function A_FatAttack1( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );

  mo.angle += FATSPREAD;
  spawnMissile( mo, mo.target, 'MT_FATSHOT' );

  const missile = spawnMissile( mo, mo.target, 'MT_FATSHOT' );
  if ( missile ) {

    missile.angle += FATSPREAD;
    missile.momx = fixedMul( missile.info.speed, fineCos(missile.angle) );
    missile.momy = fixedMul( missile.info.speed, fineSin(missile.angle) );

  }

}

export function A_FatAttack2( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );

  mo.angle -= FATSPREAD;
  spawnMissile( mo, mo.target, 'MT_FATSHOT' );

  const missile = spawnMissile( mo, mo.target, 'MT_FATSHOT' );
  if ( missile ) {

    missile.angle -= FATSPREAD * 2;
    missile.momx = fixedMul( missile.info.speed, fineCos(missile.angle) );
    missile.momy = fixedMul( missile.info.speed, fineSin(missile.angle) );

  }

}

export function A_FatAttack3( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );

  const missileA = spawnMissile( mo, mo.target, 'MT_FATSHOT' );
  if ( missileA ) {

    missileA.angle -= FATSPREAD / 2;
    missileA.momx = fixedMul( missileA.info.speed, fineCos(missileA.angle) );
    missileA.momy = fixedMul( missileA.info.speed, fineSin(missileA.angle) );

  }

  const missileB = spawnMissile( mo, mo.target, 'MT_FATSHOT' );
  if ( missileB ) {

    missileB.angle += FATSPREAD / 2;
    missileB.momx = fixedMul( missileB.info.speed, fineCos(missileB.angle) );
    missileB.momy = fixedMul( missileB.info.speed, fineSin(missileB.angle) );

  }

}

// ============================================================
// Archvile actions
// ============================================================

export function A_VileChase( mo: Mobj ): void {

  const map = getMobjMapData();
  if ( ! map ) return;

  // Look for a corpse to resurrect
  if ( mo.moveDir !== DI_NODIR ) {

    const speed = mo.info.speed;
    const tryX = mo.x + fixedMul( speed, xspeed[ mo.moveDir ] );
    const tryY = mo.y + fixedMul( speed, yspeed[ mo.moveDir ] );

    for ( const thing of allMobjs ) {

      if ( ( thing.flags & MF_CORPSE ) === 0 ) continue;
      if ( thing.tics !== -1 ) continue;
      if ( ! thing.info.raiseState ) continue;

      const maxDist = thing.info.radius + mo.info.radius;
      if ( Math.abs( thing.x - tryX ) > maxDist ) continue;
      if ( Math.abs( thing.y - tryY ) > maxDist ) continue;

      // Found a corpse — resurrect it
      const oldTarget = mo.target;
      mo.target = thing;
      A_FaceTarget( mo );
      mo.target = oldTarget;

      setMobjState( mo, 'S_VILE_HEAL1' );
      playSoundAt( 'slop', mo.x, mo.y, mo.z, mo);

      setMobjState( thing, thing.info.raiseState );
      thing.height = thing.info.height;
      thing.flags = thing.info.flags;
      thing.health = thing.info.spawnHealth;
      thing.target = null;
      return;

    }

  }

  // Normal chase
  A_Chase( mo, map );

}

export function A_VileStart( mo: Mobj ): void {

  playSoundAt( 'vilatk', mo.x, mo.y, mo.z, mo);

}

export function A_VileTarget( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );

  const fire = spawnMobj( mo.target.x, mo.target.y, mo.target.z, 'MT_FIRE' );
  if ( ! fire ) return;

  mo.tracer = fire;
  fire.target = mo;
  fire.tracer = mo.target;

  A_Fire( fire );

}

export function A_VileAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;

  A_FaceTarget( mo );

  const map = getMobjMapData();
  if ( map && ! P_CheckSight( mo, mo.target, map ) ) return;

  playSoundAt( 'barexp', mo.x, mo.y, mo.z, mo);
  damageMobj( mo.target, mo, mo, 20 );

  // Blast target upward
  const targetMass = Math.max( 1, mo.target.info.mass );
  mo.target.momz = ( ( 1000 * FRACUNIT ) / targetMass ) | 0;

  // Radius attack from fire position
  const fire = mo.tracer;
  if ( ! fire ) return;

  const angle = mo.angle;
  fire.x = mo.target.x - fixedMul( 24 * FRACUNIT, fineCos(angle) );
  fire.y = mo.target.y - fixedMul( 24 * FRACUNIT, fineSin(angle) );

  radiusAttack( fire, mo, 70 );

}

export function A_Fire( mo: Mobj ): void {

  const dest = mo.tracer;
  if ( ! dest ) return;

  const map = getMobjMapData();
  if ( map && ! P_CheckSight( mo.target ?? mo, dest, map ) ) return;

  const angle = dest.angle;
  mo.x = dest.x + fixedMul( 24 * FRACUNIT, fineCos(angle) );
  mo.y = dest.y + fixedMul( 24 * FRACUNIT, fineSin(angle) );
  mo.z = dest.z;

}

export function A_StartFire( mo: Mobj ): void {

  playSoundAt( 'flamst', mo.x, mo.y, mo.z, mo);
  A_Fire( mo );

}

export function A_FireCrackle( mo: Mobj ): void {

  playSoundAt( 'flame', mo.x, mo.y, mo.z, mo);
  A_Fire( mo );

}

// ============================================================
// Pain Elemental
// ============================================================

function countLostSouls(): number {

  let count = 0;
  for ( const mo of allMobjs ) {

    if ( mo.type === 'MT_SKULL' ) count ++;

  }
  return count;

}

function A_PainShootSkull( mo: Mobj, angle: number ): void {

  // Limit lost souls to 20
  if ( countLostSouls() > 20 ) return;

  const skullRadius = 16 * FRACUNIT;
  const preStep = 4 * FRACUNIT + ( ( 3 * ( mo.info.radius + skullRadius ) ) / 2 ) | 0;

  const x = mo.x + fixedMul( preStep, fineCos(angle) );
  const y = mo.y + fixedMul( preStep, fineSin(angle) );
  const z = mo.z + 8 * FRACUNIT;

  const skull = spawnMobj( x, y, z, 'MT_SKULL' );
  if ( ! skull ) return;

  skull.target = mo.target;
  A_SkullAttack( skull );

}

export function A_PainAttack( mo: Mobj ): void {

  if ( ! mo.target ) return;
  A_FaceTarget( mo );
  A_PainShootSkull( mo, mo.angle );

}

export function A_PainDie( mo: Mobj ): void {

  mo.flags &= ~MF_SOLID;
  A_PainShootSkull( mo, mo.angle + Math.PI / 2 );
  A_PainShootSkull( mo, mo.angle + Math.PI );
  A_PainShootSkull( mo, mo.angle + 3 * Math.PI / 2 );

}

// ============================================================
// Death / pain actions
// ============================================================

// A_Look/A_Scream voice variants consume gameplay RNG even without audio.
function playMonsterVoice(mo:Mobj,name:string):void {
  if(/^posit[123]$/.test(name))name='posit'+(P_Random()%3+1);
  else if(/^bgsit[12]$/.test(name))name='bgsit'+(P_Random()%2+1);
  else if(/^podth[123]$/.test(name))name='podth'+(P_Random()%3+1);
  else if(/^bgdth[12]$/.test(name))name='bgdth'+(P_Random()%2+1);
  if(mo.type==='MT_CYBORG'||mo.type==='MT_SPIDER')playSound(name);
  else playSoundAt(name, mo.x, mo.y, mo.z, mo);
}

export function A_Scream( mo: Mobj ): void {

  if ( mo.info.deathSound ) playMonsterVoice(mo,mo.info.deathSound);

}

export function A_XScream( mo: Mobj ): void {

  playSoundAt( 'slop', mo.x, mo.y, mo.z, mo);

}

export function A_Pain( mo: Mobj ): void {

  if ( mo.info.painSound ) playSoundAt( mo.info.painSound, mo.x, mo.y, mo.z, mo);

}

export function A_Fall( mo: Mobj ): void {

  mo.flags &= ~MF_SOLID;

}

export function A_BossDeath(mo: Mobj): void {
  const {episode,map:number}=gameRules;
  const required = episode===1 && number===8 ? 'MT_BRUISER'
    : episode===2 && number===8 ? 'MT_CYBORG'
    : episode===3 && number===8 ? 'MT_SPIDER'
    : episode===4 && number===6 ? 'MT_CYBORG'
    : episode===4 && number===8 ? 'MT_SPIDER' : null;
  if (mo.type!==required || !playerMobj || playerMobj.health<=0) return;
  if (allMobjs.some(other=>other!==mo && other.type===mo.type && other.health>0)) return;
  const map=getMobjMapData(); if (!map) return;
  if (episode===1 || (episode===4 && number===8)) evDoFloor('lowerFloorToLowest',666,map.linedefs,map.sidedefs,map.sectors);
  else if (episode===4) evDoDoor('blazeOpen',666,map.linedefs,map.sidedefs,map.sectors);
  else requestExit();
}

export function A_Hoof( mo: Mobj ): void {

  playSoundAt( 'hoof', mo.x, mo.y, mo.z, mo);
  const map = getMobjMapData();
  if ( map ) A_Chase( mo, map );

}

export function A_Metal( mo: Mobj ): void {

  playSoundAt( 'metal', mo.x, mo.y, mo.z, mo);
  const map = getMobjMapData();
  if ( map ) A_Chase( mo, map );

}

export function A_BabyMetal( mo: Mobj ): void {

  playSoundAt( 'bspwlk', mo.x, mo.y, mo.z, mo);
  const map = getMobjMapData();
  if ( map ) A_Chase( mo, map );

}

// ============================================================
// Sound propagation — P_NoiseAlert
// ============================================================

const sectorSoundTarget = new Map<number, Mobj>();
export function clearSoundTargets(): void { sectorSoundTarget.clear(); }

// P_RecursiveSound: a path may cross at most one sound-blocking linedef.
// Iterative shortest-path traversal avoids recursion overflow and revisits only
// when a route with fewer sound blocks is found.
export function P_NoiseAlert(target: Mobj, emitter: Mobj, map: DoomMapData): void {
  const sector = findSectorAtFixed(emitter.x, emitter.y, map);
  if (!sector) return;
  const queue: [number,number][] = [[map.sectors.indexOf(sector),0]];
  const costs = new Map<number,number>();
  for (let i=0; i<queue.length; i++) {
    const [index, cost] = queue[i];
    if ((costs.get(index) ?? Infinity) <= cost) continue;
    costs.set(index,cost); sectorSoundTarget.set(index,target);
    for (const line of map.linedefs) {
      if (line.left < 0) continue;
      const front=map.sidedefs[line.right].sector, back=map.sidedefs[line.left].sector;
      const next=front===index ? back : back===index ? front : -1;
      if (next < 0) continue;
      const a=map.sectors[front], b=map.sectors[back];
      if (Math.min(a.ceilingHeight,b.ceilingHeight) <= Math.max(a.floorHeight,b.floorHeight)) continue;
      const nextCost=cost+((line.flags & 64) ? 1 : 0);
      if (nextCost <= 1) queue.push([next,nextCost]);
    }
  }
}

// ============================================================
// Action dispatch — called from Mobj.ts via callback
// ============================================================

function handleEnemyAction( mo: Mobj, action: string ): boolean {

  const map = getMobjMapData();

  switch ( action ) {

    case 'A_Look':
      if ( map ) A_Look( mo, map );
      return true;

    case 'A_Chase':
      if ( map ) A_Chase( mo, map );
      return true;

    case 'A_FaceTarget':
      A_FaceTarget( mo );
      return true;

    case 'A_PosAttack':
      A_PosAttack( mo );
      return true;

    case 'A_SPosAttack':
      A_SPosAttack( mo );
      return true;

    case 'A_CPosAttack':
      A_CPosAttack( mo );
      return true;

    case 'A_CPosRefire':
      A_CPosRefire( mo );
      return true;

    case 'A_SpidRefire':
      A_SpidRefire( mo );
      return true;

    case 'A_TroopAttack':
      A_TroopAttack( mo );
      return true;

    case 'A_SargAttack':
      A_SargAttack( mo );
      return true;

    case 'A_HeadAttack':
      A_HeadAttack( mo );
      return true;

    case 'A_BruisAttack':
      A_BruisAttack( mo );
      return true;

    case 'A_SkullAttack':
      A_SkullAttack( mo );
      return true;

    case 'A_CyberAttack':
      A_CyberAttack( mo );
      return true;

    case 'A_BspiAttack':
      A_BspiAttack( mo );
      return true;

    case 'A_SkelMissile':
      A_SkelMissile( mo );
      return true;

    case 'A_SkelWhoosh':
      A_SkelWhoosh( mo );
      return true;

    case 'A_SkelFist':
      A_SkelFist( mo );
      return true;

    case 'A_Tracer':
      A_Tracer( mo );
      return true;

    case 'A_FatRaise':
      A_FatRaise( mo );
      return true;

    case 'A_FatAttack1':
      A_FatAttack1( mo );
      return true;

    case 'A_FatAttack2':
      A_FatAttack2( mo );
      return true;

    case 'A_FatAttack3':
      A_FatAttack3( mo );
      return true;

    case 'A_VileChase':
      A_VileChase( mo );
      return true;

    case 'A_VileStart':
      A_VileStart( mo );
      return true;

    case 'A_VileTarget':
      A_VileTarget( mo );
      return true;

    case 'A_VileAttack':
      A_VileAttack( mo );
      return true;

    case 'A_Fire':
      A_Fire( mo );
      return true;

    case 'A_StartFire':
      A_StartFire( mo );
      return true;

    case 'A_FireCrackle':
      A_FireCrackle( mo );
      return true;

    case 'A_PainAttack':
      A_PainAttack( mo );
      return true;

    case 'A_PainDie':
      A_PainDie( mo );
      return true;

    case 'A_Scream':
      A_Scream( mo );
      return true;

    case 'A_XScream':
      A_XScream( mo );
      return true;

    case 'A_Pain':
      A_Pain( mo );
      return true;

    case 'A_Fall':
      A_Fall( mo );
      return true;

    case 'A_Explode':
      // Handled by Mobj.ts explode callback
      return false;

    case 'A_BossDeath':
      A_BossDeath( mo );
      return true;

    case 'A_Hoof':
      A_Hoof( mo );
      return true;

    case 'A_Metal':
      A_Metal( mo );
      return true;

    case 'A_BabyMetal':
      A_BabyMetal( mo );
      return true;

    default:
      return false;

  }

}

// ============================================================
// Initialization — register with the mobj system
// ============================================================

export function initEnemyAI(): void {
  gameTic = 0; clearSoundTargets();

  setEnemyActionCallback( handleEnemyAction );

}

export function archiveEnemyAI(): {tic: number; sounds: [number,number][]} {
  return {tic:gameTic,sounds:[...sectorSoundTarget].map(([sector,mo])=>[sector,allMobjs.indexOf(mo)])};
}
export function restoreEnemyAI(state: ReturnType<typeof archiveEnemyAI>): void {
  gameTic=state.tic;sectorSoundTarget.clear();
  for(const [sector,index] of state.sounds)if(allMobjs[index])sectorSoundTarget.set(sector,allMobjs[index]);
}
