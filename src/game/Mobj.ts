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
import { findSectorAt } from '../physics/DoomMovement';
import { addThinker } from './Thinkers';
import type { MobjInfo, MobjState } from './MobjData';
import { MOBJ_STATES, MOBJ_TYPES, DOOMEDNUM_TO_TYPE, MF_SHOOTABLE, MF_SOLID, MF_NOBLOOD, MF_CORPSE, MF_NOGRAVITY, MF_NOBLOCKMAP, MF_MISSILE, MF_NOCLIP, MF_SKULLFLY } from './MobjData';
import { playSound } from '../sound';
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

}

/** Get current map data (for AI, physics, etc.) */
export function getMobjMapData(): DoomMapData | null {

  return mapData;

}

// ============================================================
// Spawn a mobj from a WAD thing
// ============================================================

export function spawnMapThing( thing: Thing ): Mobj | null {

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
    reactionTime: 8,
    moveDir: 8,     // DI_NODIR
    movecount: 0,
    lastLook: 0,
    mesh: null,
    removed: false,
  };

  // Set initial state
  setMobjState( mo, info.spawnState );

  // Find sector for correct floor/ceiling
  if ( mapData ) {

    const sector = findSectorAt( x >> FRACBITS, y >> FRACBITS, mapData );

    if ( sector ) {

      mo.floorz = intToFixed( sector.floorHeight );
      mo.ceilingz = intToFixed( sector.ceilingHeight );
      mo.z = mo.floorz;

    }

  }

  // Create sprite mesh
  createMobjSprite( mo );

  // Register thinker
  addThinker( () => mobjThinker( mo ) );

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
    mo.tics = st.tics;

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
      if ( mo.info.deathSound ) playSound( mo.info.deathSound );
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

// Callback for A_Explode — set by Attack.ts to avoid circular import
let explodeCallback: ( ( mo: Mobj ) => void ) | null = null;

export function setExplodeCallback( cb: ( mo: Mobj ) => void ): void {

  explodeCallback = cb;

}

// ============================================================
// P_XYMovement — ported from p_mobj.c
// ============================================================

function xyMovement( mo: Mobj ): void {

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

  // Check if the new position is valid (simplified — sector-based)
  const blocked = isMovementBlocked( mo, nextX, nextY );

  if ( blocked ) {

    if ( ( mo.flags & MF_MISSILE ) !== 0 && ( mo.flags & MF_NOCLIP ) === 0 ) {

      // Missile hit a wall — explode
      explodeMissile( mo );
      return;

    }

    // Non-missile blocked: stop momentum
    mo.momx = 0;
    mo.momy = 0;
    return;

  }

  // Move succeeded
  mo.x = nextX;
  mo.y = nextY;

  // Update floor/ceiling from new sector
  updateFloorCeiling( mo );

  // Missiles and skull-fly mobjs skip friction
  if ( ( mo.flags & ( MF_MISSILE | MF_SKULLFLY ) ) !== 0 ) return;

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

  if ( ( mo.flags & MF_NOCLIP ) !== 0 ) return false;
  if ( ! mapData ) return false;

  const sector = findSectorAt( nx >> FRACBITS, ny >> FRACBITS, mapData );

  if ( ! sector ) {

    // No sector at destination — blocked (out of map)
    return true;

  }

  const destFloor = intToFixed( sector.floorHeight );
  const destCeiling = intToFixed( sector.ceilingHeight );

  // Step too high (non-missile) or any obstacle (missile)
  if ( ( mo.flags & MF_MISSILE ) !== 0 ) {

    // Missiles are blocked if the gap is too small
    if ( destCeiling - destFloor < mo.height ) return true;
    // Missiles are blocked if floor is above the missile
    if ( destFloor > mo.z + mo.height ) return true;
    return false;

  }

  // Non-missile: blocked by too-high step
  if ( destFloor - mo.floorz > MAXSTEP ) return true;

  // Blocked if gap is too small
  if ( destCeiling - destFloor < mo.height ) return true;

  return false;

}

/** Update mo.floorz / mo.ceilingz from the sector at the mobj's position */
function updateFloorCeiling( mo: Mobj ): void {

  if ( ! mapData ) return;

  const sector = findSectorAt( mo.x >> FRACBITS, mo.y >> FRACBITS, mapData );

  if ( sector ) {

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

    playSound( mo.info.deathSound );

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

  // Check for immediate collision
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

    playSound( missile.info.seeSound );

  }

  missile.target = source;

  // Calculate angle toward destination
  const dx = dest.x - source.x;
  const dy = dest.y - source.y;
  missile.angle = Math.atan2( dy, dx );

  // Set horizontal momentum from angle and speed
  const speed = missile.info.speed;
  missile.momx = fixedMul( speed, Math.round( Math.cos( missile.angle ) * FRACUNIT ) );
  missile.momy = fixedMul( speed, Math.round( Math.sin( missile.angle ) * FRACUNIT ) );

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

  missile.target = null; // player missiles don't have an mobj target
  missile.angle = angle;

  // Set momentum from angle and speed (horizontal only — slope = 0)
  const speed = missile.info.speed;
  missile.momx = fixedMul( speed, Math.round( Math.cos( angle ) * FRACUNIT ) );
  missile.momy = fixedMul( speed, Math.round( Math.sin( angle ) * FRACUNIT ) );
  missile.momz = 0; // horizontal fire (no auto-aim slope)

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

function mobjThinker( mo: Mobj ): boolean {

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

  if ( ! spriteGroup ) return;

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
