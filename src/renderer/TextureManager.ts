import {
  DataTexture, RGBAFormat, NearestFilter, RepeatWrapping,
  MeshBasicMaterial, Color, DoubleSide
} from 'three/webgpu';
import type { TextureData, Palette } from '../wad/types';
import { lightLevelToColormapIndex } from '../wad/ColormapParser';

// Doom animated flat sequences (Ultimate Doom only — no animated walls in Doom 1).
// All animate at 8 tics per frame. Each entry: first frame name → array of all frame names.
const ANIM_FLAT_SEQUENCES: string[][] = [
  [ 'NUKAGE1', 'NUKAGE2', 'NUKAGE3' ],
  [ 'FWATER1', 'FWATER2', 'FWATER3', 'FWATER4' ],
  [ 'SWATER1', 'SWATER2', 'SWATER3', 'SWATER4' ],
  [ 'LAVA1', 'LAVA2', 'LAVA3', 'LAVA4' ],
  [ 'BLOOD1', 'BLOOD2', 'BLOOD3' ],
];

const ANIM_TICS_PER_FRAME = 8;

// Maps any frame name in an animated sequence to its sequence array
const flatAnimLookup = new Map<string, string[]>();

for ( const seq of ANIM_FLAT_SEQUENCES ) {

  for ( const name of seq ) {

    flatAnimLookup.set( name, seq );

  }

}

interface AnimatedEntry {
  material: MeshBasicMaterial;
  textures: DataTexture[];  // pre-built textures for each frame in the sequence
  lastFrame: number;        // last frame index applied (avoid redundant swaps)
}

export class TextureManager {

  private wallCache = new Map<string, MeshBasicMaterial>();
  private flatCache = new Map<string, MeshBasicMaterial>();
  private animatedFlats: AnimatedEntry[] = [];

  readonly wallTextures: Record<string, TextureData>;

  constructor(
    wallTextures: Record<string, TextureData>,
    private flats: Record<string, TextureData>,
    private colormap: Uint8Array[],
    private palette: Palette
  ) {

    this.wallTextures = wallTextures;

  }

  private makeColormappedTexture( texData: TextureData, lightLevel: number ): DataTexture {

    const cmIndex = lightLevelToColormapIndex( lightLevel );
    const table = this.colormap[ cmIndex ];
    const { width, height, indices } = texData;
    const rgba = new Uint8Array( width * height * 4 );

    for ( let i = 0; i < width * height; i ++ ) {

      // If original pixel was transparent (alpha=0), keep it transparent
      if ( texData.rgba[ i * 4 + 3 ] === 0 ) continue;

      const mappedIdx = table[ indices[ i ] ];
      rgba[ i * 4 ] = this.palette[ mappedIdx * 3 ];
      rgba[ i * 4 + 1 ] = this.palette[ mappedIdx * 3 + 1 ];
      rgba[ i * 4 + 2 ] = this.palette[ mappedIdx * 3 + 2 ];
      rgba[ i * 4 + 3 ] = 255;

    }

    const tex = new DataTexture( rgba, width, height, RGBAFormat );
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestFilter;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.needsUpdate = true;
    return tex;

  }

  getWallMaterial( texName: string, lightLevel: number ): MeshBasicMaterial | null {

    if ( ! texName || texName === '-' ) return null;

    const key = texName + '_' + lightLevel;
    const cached = this.wallCache.get( key );
    if ( cached ) return cached;

    const texData = this.wallTextures[ texName ];

    if ( ! texData ) {

      const cmIndex = lightLevelToColormapIndex( lightLevel );
      const brightness = 1 - cmIndex / 31;
      const mat = new MeshBasicMaterial( {
        color: new Color( brightness * 0.5, brightness * 0.4, brightness * 0.3 ),
        side: DoubleSide
      } );
      this.wallCache.set( key, mat );
      return mat;

    }

    const tex = this.makeColormappedTexture( texData, lightLevel );
    const mat = new MeshBasicMaterial( {
      map: tex,
      side: DoubleSide,
      transparent: false
    } );
    this.wallCache.set( key, mat );
    return mat;

  }

  getFlatMaterial( texName: string, lightLevel: number ): MeshBasicMaterial | null {

    if ( ! texName || texName === '-' ) return null;

    const key = texName + '_' + lightLevel;
    const cached = this.flatCache.get( key );
    if ( cached ) return cached;

    const texData = this.flats[ texName ];

    if ( ! texData ) {

      const cmIndex = lightLevelToColormapIndex( lightLevel );
      const brightness = 1 - cmIndex / 31;
      const mat = new MeshBasicMaterial( {
        color: new Color( brightness * 0.4, brightness * 0.5, brightness * 0.4 ),
        side: DoubleSide
      } );
      this.flatCache.set( key, mat );
      return mat;

    }

    const tex = this.makeColormappedTexture( texData, lightLevel );
    const mat = new MeshBasicMaterial( {
      map: tex,
      side: DoubleSide
    } );
    this.flatCache.set( key, mat );

    // Register for animation if this flat is part of an animated sequence
    const seq = flatAnimLookup.get( texName );

    if ( seq ) {

      const textures: DataTexture[] = [];

      for ( const frameName of seq ) {

        const fd = this.flats[ frameName ];

        if ( fd ) {

          textures.push( this.makeColormappedTexture( fd, lightLevel ) );

        } else {

          textures.push( tex ); // fallback

        }

      }

      this.animatedFlats.push( { material: mat, textures, lastFrame: - 1 } );

    }

    return mat;

  }

  /**
   * Update animated flat textures based on the current level time (in Doom tics).
   * Call once per frame from the game loop.
   */
  updateAnimatedTextures( levelTic: number ): void {

    for ( const entry of this.animatedFlats ) {

      const frameIdx = Math.floor( levelTic / ANIM_TICS_PER_FRAME ) % entry.textures.length;

      if ( frameIdx !== entry.lastFrame ) {

        entry.material.map = entry.textures[ frameIdx ];
        entry.material.needsUpdate = true;
        entry.lastFrame = frameIdx;

      }

    }

  }

}
