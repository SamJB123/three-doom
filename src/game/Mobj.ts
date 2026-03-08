// Map object (mobj) system — ported from p_mobj.c.
// Handles spawning, state machine, and per-tic thinking for all map objects
// (barrels, enemies, projectiles, effects).

import {
  Group, Mesh, PlaneGeometry, MeshBasicMaterial,
  DataTexture, RGBAFormat, NearestFilter, DoubleSide
} from 'three/webgpu';
import type { SpriteFrame, Thing } from '../wad/types';
import type { Fixed } from '../math/fixed';
import { FRACUNIT, FRACBITS, intToFixed, fixedToFloat, fixedMul } from '../math/fixed';
import type { DoomMapData } from '../physics/DoomMovement';
import { findSectorAt } from '../physics/DoomMovement';
import { addThinker } from './Thinkers';
import type { MobjInfo, MobjState } from './MobjData';
import { MOBJ_STATES, MOBJ_TYPES, DOOMEDNUM_TO_TYPE, MF_SHOOTABLE, MF_SOLID, MF_NOBLOOD, MF_CORPSE, MF_NOGRAVITY, MF_NOBLOCKMAP } from './MobjData';
import { playSound } from '../sound';

const SCALE = 1.0 / 32.0;

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

  // Type info
  type: string;           // e.g. 'MT_BARREL'
  info: MobjInfo;
  flags: number;
  health: number;

  // State machine
  state: string | null;
  tics: number;

  // AI fields (used by enemies later)
  target: Mobj | null;    // what this mobj is targeting / who damaged it
  threshold: number;
  reactionTime: number;

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

export function initMobjSystem(
  sprites: Record<string, SpriteFrame>,
  group: Group,
  map: DoomMapData
): void {

  spriteFrames = sprites;
  spriteGroup = group;
  mapData = map;

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
    type: typeName,
    info,
    flags: info.flags,
    health: info.spawnHealth,
    state: null,
    tics: 0,
    target: null,
    threshold: 0,
    reactionTime: 8,
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

    // If tics > 0, stop and wait
    if ( st.tics > 0 ) return true;

    name = st.next;

  }

  return true;

}

// ============================================================
// Action dispatch
// ============================================================

function execMobjAction( mo: Mobj, action: string ): void {

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

// Callback for A_Explode — set by Attack.ts to avoid circular import
let explodeCallback: ( ( mo: Mobj ) => void ) | null = null;

export function setExplodeCallback( cb: ( mo: Mobj ) => void ): void {

  explodeCallback = cb;

}

// ============================================================
// Mobj thinker — runs every tic (35Hz)
// ============================================================

function mobjThinker( mo: Mobj ): boolean {

  if ( mo.removed ) return false;

  // TODO: Apply momentum for moving mobjs (enemies, projectiles)
  // For now barrels are stationary, so skip xyMovement/zMovement

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

function createMobjSprite( mo: Mobj ): void {

  if ( ! spriteGroup ) return;

  const st = mo.state ? MOBJ_STATES[ mo.state ] : null;
  if ( ! st ) return;

  const frameLetter = String.fromCharCode( 65 + st.frame );
  const lumpName = st.sprite + frameLetter + '0';
  const frame = spriteFrames[ lumpName ];
  if ( ! frame ) return;

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
  const lumpName = st.sprite + frameLetter + '0';

  const tex = getTexture( lumpName );
  if ( ! tex ) return;

  const mat = mo.mesh.material as MeshBasicMaterial;

  if ( mat.map !== tex ) {

    // Sprite changed — rebuild the mesh geometry for new dimensions
    const frame = spriteFrames[ lumpName ];
    if ( ! frame ) return;

    const w = frame.width * SCALE;
    const h = frame.height * SCALE;

    // Dispose old geometry and create new one
    mo.mesh.geometry.dispose();
    const geom = new PlaneGeometry( w, h );
    const uvAttr = geom.getAttribute( 'uv' );

    for ( let i = 0; i < uvAttr.count; i ++ ) {

      uvAttr.setY( i, 1 - uvAttr.getY( i ) );

    }

    uvAttr.needsUpdate = true;
    mo.mesh.geometry = geom;

    mat.map = tex;
    mat.needsUpdate = true;

    // Reposition for new sprite dimensions
    const floorY = fixedToFloat( mo.floorz ) * SCALE;
    const centerXOffset = ( frame.leftOffset - frame.width / 2 ) * SCALE;
    const spriteBottom = frame.topOffset * SCALE - h;
    const lift = Math.max( 0, - spriteBottom );

    mo.mesh.position.set(
      fixedToFloat( mo.x ) * SCALE + centerXOffset,
      floorY + frame.topOffset * SCALE - h / 2 + lift,
      - fixedToFloat( mo.y ) * SCALE
    );

  }

}
