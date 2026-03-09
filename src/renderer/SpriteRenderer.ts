import {
  Group, Mesh, PlaneGeometry, MeshBasicMaterial,
  DataTexture, RGBAFormat, NearestFilter, DoubleSide
} from 'three/webgpu';
import type { Thing, SpriteFrame, Sector } from '../wad/types';
import type { DoomMapData } from '../physics/DoomMovement';
import { findSectorAt } from '../physics/DoomMovement';
import { THING_SPRITE_MAP } from '../wad/thingSpriteMap';
import { SPRITE_ANIMS } from './SpriteAnimations';

const SCALE = 1.0 / 32.0;
const DOOM_TIC = 1 / 35; // seconds per Doom tic

// Player start types (1–4) and teleport destinations (14) — skip these
const SKIP_TYPES = new Set( [ 1, 2, 3, 4, 11, 14 ] );

// Animation state attached to animated sprite meshes
interface AnimState {
  textures: DataTexture[];
  tics: number[];
  frameIndex: number;
  ticCounter: number; // counts down in Doom tics
}

/**
 * Build billboard sprite meshes for all map things.
 *
 * Each sprite is a PlaneGeometry quad textured with the sprite's frame A,
 * rotation 0 image.  The quad is positioned at the thing's map location
 * on the sector floor, offset by the sprite's leftOffset / topOffset so
 * the feet touch the ground.
 *
 * The returned Group should be added to the scene.  Each frame, call
 * updateSpriteBillboards() to face them toward the camera.
 */
// Map from Mesh to its animation state
const animatedSprites: Map<Mesh, AnimState> = new Map();

export function buildThingSprites(
  things: Thing[],
  sprites: Record<string, SpriteFrame>,
  map: DoomMapData,
  mobjTypes?: Set<number>
): Group {

  const group = new Group();
  animatedSprites.clear();

  for ( const thing of things ) {

    if ( SKIP_TYPES.has( thing.type ) ) continue;
    if ( mobjTypes && mobjTypes.has( thing.type ) ) continue;

    const prefix = THING_SPRITE_MAP[ thing.type ];
    if ( ! prefix ) continue;

    // Look up frame A, rotation 0 (e.g. "BAR1A0")
    const frameName = prefix + 'A0';
    const frame = sprites[ frameName ];
    if ( ! frame ) continue;

    // Find the sector this thing sits in via BSP
    const sector = findSectorAt( thing.x, thing.y, map );
    if ( ! sector ) continue;

    const mesh = createSpriteMesh( frame, thing, sector );
    mesh.userData.thingType = thing.type;
    mesh.userData.thingX = thing.x;
    mesh.userData.thingY = thing.y;
    mesh.userData.sector = sector;
    mesh.userData.spriteTopOffset = frame.topOffset;
    mesh.userData.spriteHeight = frame.height;
    group.add( mesh );

    // Set up animation if this sprite has one
    const anim = SPRITE_ANIMS[ prefix ];

    if ( anim ) {

      const textures: DataTexture[] = [];

      for ( const letter of anim.frames ) {

        const name = prefix + letter + '0';
        const f = sprites[ name ];

        if ( f ) {

          const tex = new DataTexture( f.rgba, f.width, f.height, RGBAFormat );
          tex.magFilter = NearestFilter;
          tex.minFilter = NearestFilter;
          tex.needsUpdate = true;
          textures.push( tex );

        } else {

          // Fallback: reuse the existing texture from the mesh
          textures.push( ( mesh.material as MeshBasicMaterial ).map as DataTexture );

        }

      }

      animatedSprites.set( mesh, {
        textures,
        tics: anim.tics,
        frameIndex: 0,
        ticCounter: anim.tics[ 0 ]
      } );

    }

  }

  return group;

}

function createSpriteMesh(
  frame: SpriteFrame,
  thing: Thing,
  sector: Sector
): Mesh {

  const { width, height, leftOffset, topOffset, rgba } = frame;

  // Texture
  const tex = new DataTexture( rgba, width, height, RGBAFormat );
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.needsUpdate = true;

  const mat = new MeshBasicMaterial( {
    map: tex,
    side: DoubleSide,
    transparent: true,
    alphaTest: 0.5,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: - 1,
    polygonOffsetUnits: - 1
  } );

  // Quad dimensions in world space
  const w = width * SCALE;
  const h = height * SCALE;

  const geom = new PlaneGeometry( w, h );

  const mesh = new Mesh( geom, mat );

  // Position: thing X/Y → Three.js X/Z, floor height → Y
  const floorY = sector.floorHeight * SCALE;

  // Doom sprite offsets:
  //   leftOffset = pixels from the left edge to the sprite's center column
  //   topOffset  = pixels from the top edge down to the sprite's foot level
  //
  // DataTexture with default flipY=false puts row 0 at the bottom of
  // the texture in OpenGL, but the quad UV has (0,0) at bottom-left.
  // Since sprite data is stored top-row-first, the image appears
  // vertically flipped on the quad.  We flip the geometry's UVs.
  const uvAttr = geom.getAttribute( 'uv' );

  for ( let i = 0; i < uvAttr.count; i ++ ) {

    uvAttr.setY( i, 1 - uvAttr.getY( i ) );

  }

  uvAttr.needsUpdate = true;

  // PlaneGeometry is centered at (0, 0, 0).
  // Shift horizontally by leftOffset so the sprite's center column is at
  // the thing's X/Y.
  //
  // Vertical: from r_things.c line 556:
  //   gzt = thing->z + spritetopoffset[lump]
  // The sprite's TOP is at thing->z + topOffset, extending downward by
  // its full height.  Many sprites intentionally extend a few pixels
  // below the floor (e.g. BAR1A0: 4px, BON1A0: 4px).  In Doom's 2D
  // renderer there's no depth buffer so those pixels are visible; in 3D
  // the floor geometry occludes them.  Clamp the quad bottom to floorY
  // so sprites sit on the floor instead of clipping through it.
  const centerXOffset = ( leftOffset - width / 2 ) * SCALE;
  const spriteBottom = topOffset * SCALE - h; // relative to floor
  const lift = Math.max( 0, - spriteBottom );

  mesh.position.set(
    thing.x * SCALE + centerXOffset,
    floorY + topOffset * SCALE - h / 2 + lift,
    - thing.y * SCALE
  );

  return mesh;

}

/**
 * Advance sprite animations by the given delta time (seconds).
 * Accumulates fractional Doom tics and advances frames when ready.
 */
let ticAccumulator = 0;

export function updateSpriteAnimations( dt: number ): void {

  ticAccumulator += dt;

  // Process whole Doom tics
  const wholeTics = Math.floor( ticAccumulator / DOOM_TIC );
  if ( wholeTics <= 0 ) return;
  ticAccumulator -= wholeTics * DOOM_TIC;

  for ( const [ mesh, state ] of animatedSprites ) {

    state.ticCounter -= wholeTics;

    while ( state.ticCounter <= 0 ) {

      state.frameIndex = ( state.frameIndex + 1 ) % state.textures.length;
      state.ticCounter += state.tics[ state.frameIndex ];

    }

    const mat = mesh.material as MeshBasicMaterial;
    const newTex = state.textures[ state.frameIndex ];

    if ( mat.map !== newTex ) {

      mat.map = newTex;
      mat.needsUpdate = true;

    }

  }

}

/**
 * Update Y positions of static sprites whose sector floor height may have changed.
 * Called after dirty sectors are rebuilt (platforms, elevators, etc.).
 */
export function updateSpriteFloorHeights( spriteGroup: Group ): void {

  for ( const child of spriteGroup.children ) {

    const sector = child.userData.sector as Sector | undefined;
    if ( ! sector ) continue;

    const topOffset = child.userData.spriteTopOffset as number;
    const spriteH = child.userData.spriteHeight as number;

    const h = spriteH * SCALE;
    const floorY = sector.floorHeight * SCALE;
    const spriteBottom = topOffset * SCALE - h;
    const lift = Math.max( 0, - spriteBottom );

    child.position.y = floorY + topOffset * SCALE - h / 2 + lift;

  }

}

/**
 * Rotate all sprite quads perpendicular to the camera's view plane.
 * In original Doom, sprites are drawn as columns perpendicular to the
 * view direction — they all share the same angle regardless of their
 * position relative to the camera.  This prevents nearby sprites from
 * visibly rotating as the player walks past.
 * Call once per frame before rendering.
 */
export function updateSpriteBillboards(
  spriteGroup: Group,
  cameraYaw: number
): void {

  for ( const child of spriteGroup.children ) {

    child.rotation.y = cameraYaw;

  }

}
