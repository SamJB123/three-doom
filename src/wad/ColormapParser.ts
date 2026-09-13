import type { WAD } from './types';
import { getLump } from './WADParser';

// Doom COLORMAP: 34 tables of 256 bytes each
// Table 0 = full brightness, table 31 = almost black, tables 32-33 = invulnerability
// Each byte maps a palette index to a darker palette index
// Used for distance-based light diminishing (like fog)

export const COLORMAP_LEVELS = 32; // 0..31 light levels (32 and 33 are special)

export function parseColormap( wad: WAD ): Uint8Array[] {

  const lump = getLump( wad, 'COLORMAP' );
  if(!lump||lump.size<34*256)throw Error('Missing or truncated COLORMAP');
  const tables: Uint8Array[] = [];

  for ( let i = 0; i < 34; i ++ ) {

    const table = new Uint8Array( 256 );

    for ( let j = 0; j < 256; j ++ ) {

      table[ j ] = wad.buf[ lump.offset + i * 256 + j ];

    }

    tables.push( table );

  }

  return tables;

}

// Apply a colormap level to an RGBA texture, producing a new darkened version.
// colormapIndex: 0 = full bright, 31 = near black
export function applyColormap(
  rgba: Uint8Array,
  width: number,
  height: number,
  palette: Uint8Array,
  colormap: Uint8Array[], // all 34 tables
  originalIndices: Uint8Array, // original palette indices for each pixel
  level: number
): Uint8Array {

  const table = colormap[ Math.min( level, 31 ) ];
  const out = new Uint8Array( width * height * 4 );

  for ( let i = 0; i < width * height; i ++ ) {

    const origIdx = originalIndices[ i ];
    const mappedIdx = table[ origIdx ];

    out[ i * 4 ] = palette[ mappedIdx * 3 ];
    out[ i * 4 + 1 ] = palette[ mappedIdx * 3 + 1 ];
    out[ i * 4 + 2 ] = palette[ mappedIdx * 3 + 2 ];
    out[ i * 4 + 3 ] = rgba[ i * 4 + 3 ]; // preserve alpha

  }

  return out;

}

// Convert a Doom sector light level (0-255) to a colormap table index (0-31).
// Doom's lighting formula: the sector light level maps to a base colormap,
// then distance further dims it. For static geometry we just use the sector level.
export function lightLevelToColormapIndex( lightLevel: number ): number {

  // Doom maps light level 0-255 roughly to colormap indices 31-0
  // Formula approximation: index = 31 - floor(lightLevel / 8)
  const idx = 31 - Math.floor( Math.min( 255, Math.max( 0, lightLevel ) ) / 8.2 );
  return Math.min( 31, Math.max( 0, idx ) );

}
