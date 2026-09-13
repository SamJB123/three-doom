import {stopSound} from '../sound/SoundManager';
import {fineSin,fineCos,pointToRadians} from '../math/angles';
// Map object (mobj) system — ported from p_mobj.c.
// Handles spawning, state machine, and per-tic thinking for all map objects
// (barrels, enemies, projectiles, effects).

import {
  Group, Mesh, PlaneGeometry, MeshBasicMaterial,
  DataTexture, RGBAFormat, NearestFilter, DoubleSide
} from 'three/webgpu';
import type { SpriteFrame, Thing } from '../wad/types';
import type { Fixed } from '../math/fixed';
import { FRACUNIT, FRACBITS, intToFixed, fixedToFloat, fixedMul, fixedDiv } from '../math/fixed';
import type { DoomMapData, DoomPlayer } from '../physics/DoomMovement';
import { findSectorAt, tryMove, checkPosition, movementCeilingLine } from '../physics/DoomMovement';
import { addThinker, archivedThinker } from './Thinkers';
import type { MobjInfo, MobjState } from './MobjData';
import { MOBJ_STATES, MOBJ_TYPES, DOOMEDNUM_TO_TYPE, MF_AMBUSH, MF_SPAWNCEILING, MF_SHOOTABLE, MF_SOLID, MF_NOBLOOD, MF_CORPSE, MF_NOGRAVITY, MF_NOBLOCKMAP, MF_MISSILE, MF_NOCLIP, MF_SKULLFLY, MF_COUNTKILL, MF_FLOAT, MF_INFLOAT, MF_SPECIAL, MF_NOSECTOR } from './MobjData';
import { playSound, playSoundAt } from '../sound';
import { gameRules, shouldSpawnThing } from './GameRules';
import { P_Random } from './DoomRandom';

const SCALE = 1.0 / 32.0;

// Physics constants — from p_mobj.c / p_local.h
const STOPSPEED = 0x1000;           // ~0.0625 in fixed-point
const FRICTION  = 0xe800;           // ~0.90625 in fixed-point
const GRAVITY   = FRACUNIT;         // 1.0 in fixed-point
const MAXSTEP   = 24 * FRACUNIT;    // max step height for floor changes

// ============================================================
// Mobj interface — extends DoomMobj with state machine + AI fields
// ============================================================

export interface Mobj {
  // Position / physics (fixed-point)
  x: Fixed;
  y: Fixed;
  z: Fixed;
  momx: Fixed;
  momy: Fixed;
  momz: Fixed;
  radius: Fixed;
  height: Fixed;
  floorz: Fixed;
  ceilingz: Fixed;
  onground: boolean;

  // Facing angle (radians, Doom-space: 0 = east, pi/2 = north)
  angle: number;

  // Type info
  type: string;           // e.g. 'MT_BARREL'
  info: MobjInfo;
  flags: number;
  health: number;

  // State machine
  state: string | null;
  tics: number;

  // Sector tracking (for sight checks and sound propagation)
  sectorIndex: number;
  spawnPoint?: Thing;
  respawnTics?: number;

  // AI fields (used by enemies)
  target: Mobj | null;    // what this mobj is targeting / who damaged it
  tracer: Mobj | null;    // homing missile target / archvile fire
  threshold: number;
  reactionTime: number;
  moveDir: number;        // current movement direction (0–8, 8 = no dir)
  movecount: number;      // tics remaining in current move direction
  lastLook: number;       // player index last looked for

  // Rendering
  mesh: Mesh | null;
  removed: boolean;
}

// Global list of all active mobjs
export const allMobjs: Mobj[] = [];

// Sprite data reference — set once from main.ts
let spriteFrames: Record<string, SpriteFrame> = {};
let spriteGroup: Group | null = null;
let mapData: DoomMapData | null = null;

// Camera position for rotation selection (updated each frame from main.ts)
let cameraX: Fixed = 0;
let cameraY: Fixed = 0;

export function setCameraPosition( x: Fixed, y: Fixed ): void {

  cameraX = x;
  cameraY = y;

}

export function initMobjSystem(
  sprites: Record<string, SpriteFrame>,
  group: Group,
  map: DoomMapData
): void {

  spriteFrames = sprites;
  spriteGroup = group;
  mapData = map;
  map.mobjs = allMobjs;

}

export function resetMobjs(): void {
  for (const mo of [...allMobjs]) removeMobj(mo);
  for (const texture of textureCache.values()) texture.dispose();
  textureCache.clear();
}

/** Get current map data (for AI, physics, etc.) */
export function getMobjMapData(): DoomMapData | null {

  return mapData;

}

// ============================================================
// Spawn a mobj from a WAD thing
// ============================================================

export function spawnMapThing( thing: Thing ): Mobj | null {

  if (!shouldSpawnThing(thing)) return null;

  const typeName = DOOMEDNUM_TO_TYPE[ thing.type ];
  if ( ! typeName ) return null;

  const info = MOBJ_TYPES[ typeName ];
  if ( ! info ) return null;

  const x = intToFixed( thing.x );
  const y = intToFixed( thing.y );

  // Find sector for floor/ceiling heights
  const sector = findSectorAt( thing.x, thing.y, mapData! );
  const floorz = sector ? intToFixed( sector.floorHeight ) : 0;
  const ceilingz = sector ? intToFixed( sector.ceilingHeight ) : 0;

  const mo = spawnMobj( x, y, floorz, typeName );
  mo.spawnPoint = {...thing};
  mo.angle = Math.trunc(thing.angle / 45) * Math.PI / 4;
  if (thing.flags & 8) mo.flags |= MF_AMBUSH;
  if (mo.tics > 0) mo.tics = 1 + P_Random() % mo.tics;
  return mo;

}

/** Spawn a mobj at an arbitrary position (for effects, projectiles, etc.) */
export function spawnMobj(
  x: Fixed, y: Fixed, z: Fixed,
  typeName: string
): Mobj {

  const info = MOBJ_TYPES[ typeName ];

  const mo: Mobj = {
    x, y, z,
    momx: 0, momy: 0, momz: 0,
    radius: info.radius,
    height: info.height,
    floorz: z,
    ceilingz: z + ( 128 * FRACUNIT ), // will be corrected by sector lookup
    onground: true,
    angle: 0,
    type: typeName,
    info,
    flags: info.flags,
    health: info.spawnHealth,
    state: null,
    tics: 0,
    sectorIndex: - 1,
    target: null,
    tracer: null,
    threshold: 0,
    reactionTime: gameRules.skill === 5 ? 0 : 8,
    moveDir: 0,     // P_SpawnMobj zero-initializes movedir (DI_EAST).
    movecount: 0,
    lastLook: P_Random() % 4,
    mesh: null,
    removed: false,
  };

  // Set initial state
  mo.state = info.spawnState;
  mo.tics = MOBJ_STATES[info.spawnState]?.tics ?? -1;

  // Find sector for correct floor/ceiling
  if ( mapData ) {

    const sector = findSectorAt( x >> FRACBITS, y >> FRACBITS, mapData );

    if ( sector ) {

      mo.floorz = intToFixed( sector.floorHeight );
      mo.ceilingz = intToFixed( sector.ceilingHeight );
      mo.sectorIndex = mapData.sectors.indexOf(sector);
      mo.z = (mo.flags & MF_SPAWNCEILING) ? mo.ceilingz - mo.height : z;

    }

  }

  // Create sprite mesh
  createMobjSprite( mo );

  // Register thinker
  restoreMobjThinker(mo);

  allMobjs.push( mo );
  return mo;

}

// ============================================================
// State machine — P_SetMobjState from p_mobj.c
// ============================================================

export function setMobjState( mo: Mobj, stateName: string ): boolean {

  let name: string | null = stateName;

  // Walk through zero-tic states immediately
  while ( name ) {

    if ( name === 'S_NULL' || ! MOBJ_STATES[ name ] ) {

      mo.state = null;
      mo.tics = 0;
      removeMobj( mo );
      return false;

    }

    const st: MobjState = MOBJ_STATES[ name ];
    mo.state = name;
    mo.tics = gameRules.skill===5 && /^S_SARG_(RUN|ATK|PAIN)/.test(name) ? Math.max(1,st.tics>>1) : st.tics;

    // Execute action
    if ( st.action ) execMobjAction( mo, st.action );

    // If tics > 0 or -1 (infinite), stop and wait
    if ( st.tics !== 0 ) return true;

    name = st.next;

  }

  return true;

}

// ============================================================
// Action dispatch
// ============================================================

function execMobjAction( mo: Mobj, action: string ): void {

  // Delegate to enemy AI system if registered
  if ( enemyActionCallback && enemyActionCallback( mo, action ) ) return;

  switch ( action ) {

    case 'A_Scream':
      if ( mo.info.deathSound ) playSoundAt( mo.info.deathSound, mo.x, mo.y, mo.z, mo);
      break;

    case 'A_BFGSpray':
      bfgSprayCallback?.(mo);
      break;

    case 'A_Explode':
      // Imported dynamically to avoid circular deps — called from Attack.ts
      if ( explodeCallback ) explodeCallback( mo );
      break;

    case 'A_Fall':
      // Remove MF_SOLID so corpse doesn't block
      mo.flags &= ~MF_SOLID;
      break;

  }

}

// Callback for enemy AI actions — set by EnemyAI.ts to avoid circular import
// Returns true if the action was handled
let enemyActionCallback: ( ( mo: Mobj, action: string ) => boolean ) | null = null;

export function setEnemyActionCallback( cb: ( mo: Mobj, action: string ) => boolean ): void {

  enemyActionCallback = cb;

}

let bfgSprayCallback: ((mo: Mobj) => void) | null = null;
export function setBfgSprayCallback(callback: (mo: Mobj) => void): void { bfgSprayCallback = callback; }

// Callback for A_Explode — set by Attack.ts to avoid circular import
let explodeCallback: ( ( mo: Mobj ) => void ) | null = null;

export function setExplodeCallback( cb: ( mo: Mobj ) => void ): void {

  explodeCallback = cb;

}

// Callback for damageMobj — set by Attack.ts to avoid circular import
let damageMobjCallback: ( ( target: Mobj, inflictor: Mobj | null, source: Mobj | null, damage: number ) => void ) | null = null;

export function setDamageMobjCallback( cb: ( target: Mobj, inflictor: Mobj | null, source: Mobj | null, damage: number ) => void ): void {

  damageMobjCallback = cb;

}

let missileAim: ((source:Mobj,angle:number,range:Fixed)=>{slope:Fixed;target:Mobj|null})|null=null;
export function setMissileAimCallback(callback:NonNullable<typeof missileAim>):void {missileAim=callback;}

// ============================================================
// P_XYMovement — ported from p_mobj.c
// ============================================================

function xyMovement( mo: Mobj ): void {
  if (!(mo.flags & (MF_MISSILE | MF_SKULLFLY))) { xyMovementStep(mo); return; }
  const mx = mo.momx, my = mo.momy;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(my)) / (8 * FRACUNIT)));
  for (let i=0; i<steps; i++) {
    mo.momx = Math.trunc(mx * (i+1) / steps) - Math.trunc(mx * i / steps);
    mo.momy = Math.trunc(my * (i+1) / steps) - Math.trunc(my * i / steps);
    xyMovementStep(mo);
    if (mo.removed || !(mo.flags & (MF_MISSILE | MF_SKULLFLY)) || (mo.momx===0 && mo.momy===0)) return;
  }
  mo.momx = mx; mo.momy = my;
}

// PIT_CheckThing projectile/skull branches. Check the candidate position
// before committing movement, including the initial half-tic missile step.
function projectileThingImpact(mo:Mobj,x:Fixed,y:Fixed):boolean {
  if(!(mo.flags & (MF_MISSILE|MF_SKULLFLY)) || mo.flags & MF_NOCLIP)return false;
  for(const thing of allMobjs){
    if(thing===mo || thing.removed || !(thing.flags & (MF_SOLID|MF_SPECIAL|MF_SHOOTABLE)))continue;
    const distance=thing.radius+mo.radius;
    if(Math.abs(thing.x-x)>=distance || Math.abs(thing.y-y)>=distance)continue;
    if(mo.flags & MF_SKULLFLY){
      damageMobjCallback?.(thing,mo,mo,((P_Random()%8)+1)*mo.info.damage);
      mo.flags &= ~MF_SKULLFLY;mo.momx=mo.momy=mo.momz=0;
      setMobjState(mo,mo.info.spawnState);return true;
    }
    if(mo.z>thing.z+thing.height || mo.z+mo.height<thing.z)continue;
    const origin=mo.target;
    if(thing===origin)continue;
    const sameSpecies=origin && (origin.type===thing.type ||
      (origin.type==='MT_KNIGHT' && thing.type==='MT_BRUISER') ||
      (origin.type==='MT_BRUISER' && thing.type==='MT_KNIGHT'));
    if(sameSpecies && thing.type!=='MT_PLAYER'){explodeMissile(mo);return true;}
    if(!(thing.flags & MF_SHOOTABLE)){
      if(!(thing.flags & MF_SOLID))continue;
    }else damageMobjCallback?.(thing,mo,origin,((P_Random()%8)+1)*mo.info.damage);
    explodeMissile(mo);return true;
  }
  return false;
}

function xyMovementStep( mo: Mobj ): void {

  if ( mo.momx === 0 && mo.momy === 0 ) {

    // Skull fly that stopped: reset to spawn state
    if ( ( mo.flags & MF_SKULLFLY ) !== 0 ) {

      mo.flags &= ~MF_SKULLFLY;
      mo.momx = 0;
      mo.momy = 0;
      mo.momz = 0;
      setMobjState( mo, mo.info.spawnState );

    }

    return;

  }

  const nextX = mo.x + mo.momx;
  const nextY = mo.y + mo.momy;

  if(projectileThingImpact(mo,nextX,nextY))return;

  // Check shared line/sector movement constraints.
  const blocked = isMovementBlocked( mo, nextX, nextY );

  if ( blocked ) {

    if ( ( mo.flags & MF_MISSILE ) !== 0 && ( mo.flags & MF_NOCLIP ) === 0 ) {

      // P_XYMovement's sky-wall exception is tied to the ceiling-limiting
      // linedef's original back sector, not just the sector under the missile.
      const ceilingLine=movementCeilingLine();
      if(mapData && ceilingLine && ceilingLine.left>=0 &&
        mapData.sectors[mapData.sidedefs[ceilingLine.left].sector].ceilingTex==='F_SKY1')removeMobj(mo);
      else explodeMissile( mo );
      return;

    }

    // Non-missile blocked: stop momentum
    mo.momx = 0;
    mo.momy = 0;
    return;

  }

  // tryMove already updated position and may have teleported through a crossing.

  // Update floor/ceiling from new sector
  updateFloorCeiling( mo );

  if (mo.flags & (MF_MISSILE | MF_SKULLFLY)) return; // no friction

  // Don't apply friction if airborne
  if ( mo.z > mo.floorz ) return;

  // Stop if below threshold
  if (
    mo.momx > - STOPSPEED &&
    mo.momx < STOPSPEED &&
    mo.momy > - STOPSPEED &&
    mo.momy < STOPSPEED
  ) {

    mo.momx = 0;
    mo.momy = 0;
    return;

  }

  // Apply friction
  mo.momx = fixedMul( mo.momx, FRICTION );
  mo.momy = fixedMul( mo.momy, FRICTION );

}

// ============================================================
// P_ZMovement — ported from p_mobj.c
// ============================================================

function zMovement( mo: Mobj ): void {

  // Apply vertical momentum
  mo.z += mo.momz;
  // P_ZMovement: float only when close enough to the target's vertical offset.
  if ((mo.flags & MF_FLOAT) && mo.target && !(mo.flags & (MF_SKULLFLY | MF_INFLOAT))) {
    const distance = approxDistance(mo.x-mo.target.x, mo.y-mo.target.y);
    const delta = mo.target.z + (mo.height >> 1) - mo.z;
    if (delta < 0 && distance < -delta * 3) mo.z -= 4 * FRACUNIT;
    else if (delta > 0 && distance < delta * 3) mo.z += 4 * FRACUNIT;
  }

  // Hit floor
  if ( mo.z <= mo.floorz ) {

    if ( ( mo.flags & MF_SKULLFLY ) !== 0 ) {

      mo.momz = - mo.momz;

    }

    if ( mo.momz < 0 ) {

      mo.momz = 0;

    }

    mo.z = mo.floorz;
    mo.onground = true;

    // Missile hits floor — explode
    if ( ( mo.flags & MF_MISSILE ) !== 0 && ( mo.flags & MF_NOCLIP ) === 0 ) {

      explodeMissile( mo );
      return;

    }

    return;

  }

  mo.onground = false;

  // Apply gravity for non-floating objects
  if ( ( mo.flags & MF_NOGRAVITY ) === 0 ) {

    if ( mo.momz === 0 ) {

      mo.momz = - GRAVITY * 2;

    } else {

      mo.momz -= GRAVITY;

    }

  }

  // Hit ceiling
  if ( mo.z + mo.height > mo.ceilingz ) {

    if ( mo.momz > 0 ) {

      mo.momz = 0;

    }

    mo.z = mo.ceilingz - mo.height;

    if ( ( mo.flags & MF_SKULLFLY ) !== 0 ) {

      mo.momz = - mo.momz;

    }

    // Missile hits ceiling — explode
    if ( ( mo.flags & MF_MISSILE ) !== 0 && ( mo.flags & MF_NOCLIP ) === 0 ) {

      explodeMissile( mo );

    }

  }

}

// ============================================================
// Movement helpers
// ============================================================

/** Check if movement to (nx, ny) is blocked for this mobj.
 *  Simplified: missiles are blocked by invalid sectors or floor too high. */
function isMovementBlocked( mo: Mobj, nx: Fixed, ny: Fixed ): boolean {

  if ( !mapData ) return false;
  return !tryMove(mo, nx, ny, mapData);

}

/** Update mo.floorz / mo.ceilingz from the sector at the mobj's position */
function updateFloorCeiling( mo: Mobj ): void {

  if ( ! mapData ) return;

  const sector = findSectorAt( mo.x >> FRACBITS, mo.y >> FRACBITS, mapData );

  if ( sector ) {

    mo.sectorIndex = mapData.sectors.indexOf(sector);
    mo.floorz = intToFixed( sector.floorHeight );
    mo.ceilingz = intToFixed( sector.ceilingHeight );

  }

}

// ============================================================
// P_ExplodeMissile — ported from p_mobj.c
// ============================================================

export function explodeMissile( mo: Mobj ): void {

  mo.momx = 0;
  mo.momy = 0;
  mo.momz = 0;

  // Set death state (explosion animation)
  if ( mo.info.deathState ) {

    setMobjState( mo, mo.info.deathState );

  }

  // Randomize tics slightly
  mo.tics -= P_Random() & 3;
  if ( mo.tics < 1 ) mo.tics = 1;

  // Clear missile flag so it no longer moves or explodes again
  mo.flags &= ~MF_MISSILE;

  // Play death sound
  if ( mo.info.deathSound ) {

    playSoundAt( mo.info.deathSound, mo.x, mo.y, mo.z, mo);

  }

}

// ============================================================
// P_CheckMissileSpawn — advance missile half a tic to avoid
// spawning inside the shooter, then check for immediate collision.
// ============================================================

function checkMissileSpawn( missile: Mobj ): void {

  // Randomize tics slightly
  missile.tics -= P_Random() & 3;
  if ( missile.tics < 1 ) missile.tics = 1;

  // Move the missile forward by half a tic
  missile.x += missile.momx >> 1;
  missile.y += missile.momy >> 1;
  missile.z += missile.momz >> 1;

  // P_CheckMissileSpawn also checks actors at the initial half-step.
  if (projectileThingImpact(missile,missile.x,missile.y))return;
  if ( isMovementBlocked( missile, missile.x, missile.y ) ) {

    explodeMissile( missile );

  }

}

// ============================================================
// P_SpawnMissile — spawn a projectile from source aimed at dest
// Used by enemy attacks.
// ============================================================

export function spawnMissile( source: Mobj, dest: Mobj, typeName: string ): Mobj | null {

  const info = MOBJ_TYPES[ typeName ];
  if ( ! info ) return null;

  // Spawn at source position + 32 units above floor (4 * 8 * FRACUNIT)
  const spawnZ = source.z + 4 * 8 * FRACUNIT;
  const missile = spawnMobj( source.x, source.y, spawnZ, typeName );

  // Override z — don't snap to floor for missiles
  missile.z = spawnZ;
  updateFloorCeiling( missile );

  // Play see sound
  if ( missile.info.seeSound ) {

    playSoundAt( missile.info.seeSound, missile.x, missile.y, missile.z, missile);

  }

  missile.target = source;

  // Calculate angle toward destination
  const dx = dest.x - source.x;
  const dy = dest.y - source.y;
  missile.angle = pointToRadians(dx,dy);

  // Set horizontal momentum from angle and speed
  const speed = gameRules.skill===5 && ['MT_TROOPSHOT','MT_HEADSHOT','MT_BRUISERSHOT'].includes(typeName) ? 20*FRACUNIT : missile.info.speed;
  missile.momx = fixedMul( speed, fineCos(missile.angle) );
  missile.momy = fixedMul( speed, fineSin(missile.angle) );

  // Set vertical momentum to aim at dest's height
  const dist = approxDistance( dx, dy );
  const safeDist = Math.max( 1, Math.trunc( dist / Math.max( 1, speed ) ) );
  missile.momz = Math.trunc( ( dest.z - source.z ) / safeDist );

  checkMissileSpawn( missile );
  return missile;

}

// ============================================================
// P_SpawnPlayerMissile — spawn a projectile from the player
// Used by rocket launcher, plasma, BFG.
// ============================================================

export function spawnPlayerMissile(
  player: DoomPlayer,
  angle: number,
  typeName: string
): Mobj | null {

  const info = MOBJ_TYPES[ typeName ];
  if ( ! info ) return null;

  let slope:Fixed=0;
  const originalAngle=angle;
  // P_SpawnPlayerMissile: center, +1<<26, -1<<26 (5.625 degrees).
  for(const offset of [0,Math.PI/32,-Math.PI/32]){
    const aimed=missileAim?.(player.mo,originalAngle+offset,1024*FRACUNIT);
    if(aimed?.target){angle=originalAngle+offset;slope=aimed.slope;break;}
  }

  // Spawn at player position + 32 units above floor
  const spawnZ = player.mo.z + 4 * 8 * FRACUNIT;
  const missile = spawnMobj( player.mo.x, player.mo.y, spawnZ, typeName );

  // Override z — don't snap to floor for missiles
  missile.z = spawnZ;
  updateFloorCeiling( missile );

  // Play see sound
  if ( missile.info.seeSound ) {

    playSound( missile.info.seeSound );

  }

  missile.target = player.mo; // shooter must be excluded from missile impacts
  missile.angle = angle;

  // Set momentum from the selected aim angle and slope.
  const speed = gameRules.skill===5 && ['MT_TROOPSHOT','MT_HEADSHOT','MT_BRUISERSHOT'].includes(typeName) ? 20*FRACUNIT : missile.info.speed;
  missile.momx = fixedMul( speed, fineCos(angle) );
  missile.momy = fixedMul( speed, fineSin(angle) );
  missile.momz = fixedMul(speed,slope);

  checkMissileSpawn( missile );
  return missile;

}

/** Approximate distance — P_AproxDistance from p_maputl.c */
function approxDistance( dx: Fixed, dy: Fixed ): number {

  const adx = Math.abs( dx );
  const ady = Math.abs( dy );
  return adx < ady ? adx + ady - Math.trunc( adx / 2 ) : adx + ady - Math.trunc( ady / 2 );

}

// ============================================================
// Mobj thinker — runs every tic (35Hz)
// ============================================================

let mobjLevelTime:()=>number=()=>0;
export function setMobjLevelTimeSource(source:()=>number):void {mobjLevelTime=source;}
let playerThinker: ((mo:Mobj)=>void)|null=null;
export function setPlayerThinkerCallback(callback:(mo:Mobj)=>void):void {playerThinker=callback;}

function mobjThinker( mo: Mobj ): boolean {

  if(mo.type==='MT_PLAYER'){if(mo.removed)return false;playerThinker?.(mo);return true;}

  if ( mo.removed ) return false;

  // Always refresh floor/ceiling from sector — platforms/elevators may have
  // changed the sector height underneath this mobj since last tic.
  updateFloorCeiling( mo );

  // XY movement (momentum + friction)
  if ( mo.momx !== 0 || mo.momy !== 0 || ( mo.flags & MF_SKULLFLY ) !== 0 ) {

    xyMovement( mo );
    if ( mo.removed ) return false;

  }

  // Z movement (gravity + floor/ceiling clamping)
  if ( mo.z !== mo.floorz || mo.momz !== 0 ) {

    zMovement( mo );
    if ( mo.removed ) return false;

  }

  // P_MobjThinker: corpse delay uses movecount; attempts are gated by
  // global leveltime, not the age of each corpse. Lost souls lack COUNTKILL.
  if(gameRules.skill===5 && (mo.flags&MF_COUNTKILL) && mo.tics===-1 && mo.spawnPoint && mapData){
    mo.movecount++;
    if(mo.movecount>=12*35 && !(mobjLevelTime()&31) && P_Random()<=4){
      const point=mo.spawnPoint,x=intToFixed(point.x),y=intToFixed(point.y);
      if(checkPosition(mo,x,y,mapData)){
        const floor=findSectorAt(point.x,point.y,mapData)?.floorHeight ?? 0;
        const oldFog=spawnMobj(mo.x,mo.y,mo.floorz,'MT_TFOG');
        const newFog=spawnMobj(x,y,intToFixed(floor),'MT_TFOG');
        playSoundAt('telept',oldFog.x,oldFog.y,oldFog.z,oldFog);playSoundAt('telept',newFog.x,newFog.y,newFog.z,newFog);
        const replacement=spawnMobj(x,y,intToFixed(floor),mo.type);
        replacement.spawnPoint={...point};replacement.angle=Math.trunc(point.angle/45)*Math.PI/4;
        if(point.flags&8)replacement.flags|=MF_AMBUSH;
        replacement.reactionTime=18;removeMobj(mo);return false;
      }
    }
  }
  // Advance state machine
  if ( mo.tics !== - 1 ) {

    mo.tics --;

    if ( mo.tics <= 0 ) {

      const st = mo.state ? MOBJ_STATES[ mo.state ] : null;

      if ( st ) {

        setMobjState( mo, st.next );

      }

    }

  }

  // Update sprite
  updateMobjSprite( mo );

  return ! mo.removed;

}

// ============================================================
// Remove mobj
// ============================================================

export function removeMobj( mo: Mobj ): void {

  if ( mo.removed ) return;
  mo.removed = true;
  stopSound(mo);

  // Remove from scene
  if ( mo.mesh && spriteGroup ) {

    spriteGroup.remove( mo.mesh );
    mo.mesh.geometry.dispose();
    mo.mesh = null;

  }

  // Remove from global list
  const idx = allMobjs.indexOf( mo );
  if ( idx >= 0 ) allMobjs.splice( idx, 1 );

}

// ============================================================
// Sprite creation and update
// ============================================================

// Cache for pre-created DataTextures
const textureCache = new Map<string, DataTexture>();

function getTexture( lumpName: string ): DataTexture | null {

  const cached = textureCache.get( lumpName );
  if ( cached ) return cached;

  const frame = spriteFrames[ lumpName ];
  if ( ! frame ) return null;

  const tex = new DataTexture( frame.rgba, frame.width, frame.height, RGBAFormat );
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.needsUpdate = true;

  textureCache.set( lumpName, tex );
  return tex;

}

/**
 * Resolve the sprite lump name and flip flag for a mobj, given the camera position.
 * Returns { lumpName, frame, flip } or null if no sprite found.
 *
 * Doom's rotation system (from r_things.c):
 * - Rotation 0 suffix: no rotations, single image for all views
 * - Rotations 1-8: 8 viewing angles
 *   rot = ((viewAngle - mobjAngle) + 202.5°) mapped to 0-7
 * - Mirrored lumps: e.g. POSSA2A8 means lump serves rotation 2 unflipped
 *   and rotation 8 flipped (horizontally mirrored)
 */
function resolveSpriteRotation(
  mo: Mobj,
  spritePrefix: string,
  frameLetter: string
): { lumpName: string; frame: SpriteFrame; flip: boolean } | null {

  // Try rotation 0 first (no rotations)
  const name0 = spritePrefix + frameLetter + '0';

  if ( spriteFrames[ name0 ] ) {

    return { lumpName: name0, frame: spriteFrames[ name0 ], flip: false };

  }

  // Compute rotation index from camera angle to mobj vs mobj's facing angle
  const viewAngle = Math.atan2( mo.y - cameraY, mo.x - cameraX );
  let angleDiff = viewAngle - mo.angle;

  // Normalize to [0, 2π)
  angleDiff = ( ( angleDiff % ( Math.PI * 2 ) ) + Math.PI * 2 ) % ( Math.PI * 2 );

  // Add 202.5° offset (matches original: (ANG45/2)*9 = 9 * 22.5°)
  angleDiff += 202.5 * Math.PI / 180;
  angleDiff = ( ( angleDiff % ( Math.PI * 2 ) ) + Math.PI * 2 ) % ( Math.PI * 2 );

  // Map to rotation 1-8 (divide full circle into 8 sectors)
  const rot = ( Math.floor( angleDiff / ( Math.PI * 2 ) * 8 ) % 8 ) + 1;

  // Try direct rotation
  const nameR = spritePrefix + frameLetter + rot;
  if ( spriteFrames[ nameR ] ) {

    return { lumpName: nameR, frame: spriteFrames[ nameR ], flip: false };

  }

  // Try mirrored rotation (e.g., rotation 8 is stored as flipped rotation 2)
  // Mirror pairs: 2↔8, 3↔7, 4↔6, 1 and 5 are never mirrored
  const mirrorMap: Record<number, number> = { 2: 8, 3: 7, 4: 6, 6: 4, 7: 3, 8: 2 };
  const mirrorRot = mirrorMap[ rot ];

  if ( mirrorRot ) {

    const nameM = spritePrefix + frameLetter + mirrorRot;
    if ( spriteFrames[ nameM ] ) {

      return { lumpName: nameM, frame: spriteFrames[ nameM ], flip: true };

    }

  }

  // Fallback to rotation 1
  const name1 = spritePrefix + frameLetter + '1';
  if ( spriteFrames[ name1 ] ) {

    return { lumpName: name1, frame: spriteFrames[ name1 ], flip: false };

  }

  return null;

}

function createMobjSprite( mo: Mobj ): void {

  if ( ! spriteGroup || mo.flags & MF_NOSECTOR || mo.state==='S_NULL' ) return;

  const st = mo.state ? MOBJ_STATES[ mo.state ] : null;
  if ( ! st ) return;

  const frameLetter = String.fromCharCode( 65 + st.frame );
  const resolved = resolveSpriteRotation( mo, st.sprite, frameLetter );
  if ( ! resolved ) return;

  const { lumpName, frame, flip } = resolved;
  const tex = getTexture( lumpName );
  if ( ! tex ) return;

  const mat = new MeshBasicMaterial( {
    map: tex,
    side: DoubleSide,
    transparent: true,
    alphaTest: 0.5,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: - 1,
    polygonOffsetUnits: - 1,
  } );

  const w = frame.width * SCALE;
  const h = frame.height * SCALE;
  const geom = new PlaneGeometry( w, h );

  // Flip UVs (sprite data is top-row-first)
  const uvAttr = geom.getAttribute( 'uv' );

  for ( let i = 0; i < uvAttr.count; i ++ ) {

    uvAttr.setY( i, 1 - uvAttr.getY( i ) );

  }

  uvAttr.needsUpdate = true;

  const mesh = new Mesh( geom, mat );

  // Position
  const floorY = fixedToFloat( mo.floorz ) * SCALE;
  const centerXOffset = ( frame.leftOffset - frame.width / 2 ) * SCALE;
  const spriteBottom = frame.topOffset * SCALE - h;
  const lift = Math.max( 0, - spriteBottom );

  mesh.position.set(
    fixedToFloat( mo.x ) * SCALE + centerXOffset,
    floorY + frame.topOffset * SCALE - h / 2 + lift,
    - fixedToFloat( mo.y ) * SCALE
  );

  // Store mobj reference on mesh for hit detection
  mesh.userData.mobj = mo;
  mesh.userData.thingType = mo.info.doomedNum;
  mesh.userData.thingX = mo.x >> FRACBITS;
  mesh.userData.thingY = mo.y >> FRACBITS;

  mo.mesh = mesh;
  spriteGroup.add( mesh );

}

function updateMobjSprite( mo: Mobj ): void {

  if ( ! mo.mesh || ! mo.state ) return;

  const st = MOBJ_STATES[ mo.state ];
  if ( ! st ) return;

  const frameLetter = String.fromCharCode( 65 + st.frame );
  const resolved = resolveSpriteRotation( mo, st.sprite, frameLetter );
  if ( ! resolved ) return;

  const { lumpName, frame, flip } = resolved;
  const tex = getTexture( lumpName );
  if ( ! tex ) return;

  const mat = mo.mesh.material as MeshBasicMaterial;
  const prevFlip = mo.mesh.userData.flipped ?? false;

  if ( mat.map !== tex || flip !== prevFlip ) {

    const w = frame.width * SCALE;
    const h = frame.height * SCALE;

    // Rebuild geometry for new dimensions and flip state
    mo.mesh.geometry.dispose();
    const geom = new PlaneGeometry( w, h );
    const uvAttr = geom.getAttribute( 'uv' );

    for ( let i = 0; i < uvAttr.count; i ++ ) {

      // Flip Y (top-row-first data) and optionally flip X (mirror)
      uvAttr.setY( i, 1 - uvAttr.getY( i ) );

      if ( flip ) {

        uvAttr.setX( i, 1 - uvAttr.getX( i ) );

      }

    }

    uvAttr.needsUpdate = true;
    mo.mesh.geometry = geom;
    mo.mesh.userData.flipped = flip;

    mat.map = tex;
    mat.needsUpdate = true;

  }

  // Always reposition — mobj may have moved (projectiles, knockback, etc.)
  const w = frame.width * SCALE;
  const h = frame.height * SCALE;
  const mobjY = fixedToFloat( mo.z ) * SCALE;
  const centerXOffset = ( frame.leftOffset - frame.width / 2 ) * SCALE;
  const spriteBottom = frame.topOffset * SCALE - h;
  const lift = Math.max( 0, - spriteBottom );

  mo.mesh.position.set(
    fixedToFloat( mo.x ) * SCALE + centerXOffset,
    mobjY + frame.topOffset * SCALE - h / 2 + lift,
    - fixedToFloat( mo.y ) * SCALE
  );

}

export type SavedMobj = Omit<Mobj, 'mesh' | 'info' | 'target' | 'tracer'> & {target: number; tracer: number};
export function archiveMobjs(): SavedMobj[] {
  return allMobjs.map(mo=>{
    const {mesh,info,target,tracer,...state}=mo;
    return structuredClone({...state,target:target ? allMobjs.indexOf(target) : -1,tracer:tracer ? allMobjs.indexOf(tracer) : -1});
  });
}
export function restoreMobjThinker(mo: Mobj): void {
  addThinker(archivedThinker(()=>mobjThinker(mo),'mobj',()=>mo.removed ? undefined : allMobjs.indexOf(mo)));
}
export function restoreMobjs(saved: SavedMobj[], player: Mobj): void {
  resetMobjs();
  for(const state of saved) {
    const mo=state.type==='MT_PLAYER' ? player : spawnMobj(state.x,state.y,state.z,state.type);
    if(mo===player)allMobjs.push(mo);
    const {target,tracer,...scalar}=state;
    Object.assign(mo,scalar,{info:MOBJ_TYPES[state.type],target:null,tracer:null});
    if(mo!==player)updateMobjSprite(mo);
  }
  saved.forEach((state,i)=>{
    allMobjs[i].target=allMobjs[state.target] ?? null;
    allMobjs[i].tracer=allMobjs[state.tracer] ?? null;
  });
}
