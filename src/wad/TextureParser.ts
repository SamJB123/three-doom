import type { WAD, Palette, TextureData, PatchData, SpriteFrame } from './types';
import { getLump, readStr } from './WADParser';

export function parsePalette( wad: WAD ): Palette {

  const lump = getLump( wad, 'PLAYPAL' )!;
  const palette = new Uint8Array( 256 * 3 );

  for ( let i = 0; i < 256 * 3; i ++ ) {

    palette[ i ] = wad.buf[ lump.offset + i ];

  }

  return palette;

}

export function parseFlats( wad: WAD, palette: Palette ): Record<string, TextureData> {

  const flats: Record<string, TextureData> = {};
  let inFlats = false;

  for ( const lump of wad.lumps ) {

    if ( lump.name === 'F_START' || lump.name === 'F1_START' || lump.name === 'F2_START' ) {

      inFlats = true;
      continue;

    }

    if ( lump.name === 'F_END' || lump.name === 'F1_END' || lump.name === 'F2_END' ) {

      inFlats = false;
      continue;

    }

    if ( inFlats && lump.size === 4096 ) {

      const rgba = new Uint8Array( 64 * 64 * 4 );
      const indices = new Uint8Array( 4096 );

      for ( let i = 0; i < 4096; i ++ ) {

        const idx = wad.buf[ lump.filepos + i ];
        indices[ i ] = idx;
        rgba[ i * 4 ] = palette[ idx * 3 ];
        rgba[ i * 4 + 1 ] = palette[ idx * 3 + 1 ];
        rgba[ i * 4 + 2 ] = palette[ idx * 3 + 2 ];
        rgba[ i * 4 + 3 ] = 255;

      }

      flats[ lump.name ] = { width: 64, height: 64, rgba, indices };

    }

  }

  return flats;

}

export function parsePatch( wad: WAD, lumpOffset: number ): PatchData {

  const view = wad.view;
  const buf = wad.buf;

  const width = view.getInt16( lumpOffset, true );
  const height = view.getInt16( lumpOffset + 2, true );
  const leftOffset = view.getInt16( lumpOffset + 4, true );
  const topOffset = view.getInt16( lumpOffset + 6, true );

  const columnOfs: number[] = [];

  for ( let x = 0; x < width; x ++ ) {

    columnOfs.push( view.getUint32( lumpOffset + 8 + x * 4, true ) );

  }

  const pixels = new Int16Array( width * height ).fill( - 1 );

  for ( let x = 0; x < width; x ++ ) {

    let ofs = lumpOffset + columnOfs[ x ];
    let safety = 0;

    while ( safety ++ < 256 ) {

      const topdelta = buf[ ofs ];
      if ( topdelta === 0xFF ) break;
      const length = buf[ ofs + 1 ];
      ofs += 3; // skip unused padding byte

      for ( let j = 0; j < length; j ++ ) {

        const y = topdelta + j;
        if ( y < height ) {

          pixels[ y * width + x ] = buf[ ofs + j ];

        }

      }

      ofs += length + 1; // skip trailing padding

    }

  }

  return { width, height, leftOffset, topOffset, pixels };

}

export function parseTextures( wad: WAD, palette: Palette ): Record<string, TextureData> {

  const buf = wad.buf;
  const view = wad.view;

  // Parse PNAMES
  const pnamesLump = getLump( wad, 'PNAMES' )!;
  const numPnames = view.getInt32( pnamesLump.offset, true );
  const pnames: string[] = [];

  for ( let i = 0; i < numPnames; i ++ ) {

    pnames.push( readStr( buf, pnamesLump.offset + 4 + i * 8, 8 ) );

  }

  // Build patch lump lookup
  const patchLumps: Record<string, { filepos: number; size: number }> = {};
  let inPatches = false;

  for ( const lump of wad.lumps ) {

    const startMarkers = [ 'P_START', 'P1_START', 'P2_START', 'PP_START' ];
    const endMarkers = [ 'P_END', 'P1_END', 'P2_END', 'PP_END' ];

    if ( startMarkers.includes( lump.name ) ) {

      inPatches = true;
      continue;

    }

    if ( endMarkers.includes( lump.name ) ) {

      inPatches = false;
      continue;

    }

    if ( inPatches && lump.size > 0 ) {

      patchLumps[ lump.name ] = lump;

    }

  }

  for ( const pname of pnames ) {

    if ( ! patchLumps[ pname ] && wad.lumpMap[ pname ] ) {

      patchLumps[ pname ] = wad.lumpMap[ pname ];

    }

  }

  const textures: Record<string, TextureData> = {};

  function parseTextureLump( lumpName: string ): void {

    const lump = getLump( wad, lumpName );
    if ( ! lump ) return;

    const base = lump.offset;
    const numTex = view.getInt32( base, true );

    for ( let i = 0; i < numTex; i ++ ) {

      const texOff = base + view.getInt32( base + 4 + i * 4, true );
      const name = readStr( buf, texOff, 8 );
      const width = view.getInt16( texOff + 12, true );
      const height = view.getInt16( texOff + 14, true );
      const patchCount = view.getInt16( texOff + 20, true );

      const pixels = new Int16Array( width * height ).fill( - 1 );

      for ( let p = 0; p < patchCount; p ++ ) {

        const patchOff = texOff + 22 + p * 10;
        const originX = view.getInt16( patchOff, true );
        const originY = view.getInt16( patchOff + 2, true );
        const patchIdx = view.getInt16( patchOff + 4, true );

        const patchName = pnames[ patchIdx ];
        const patchLump = patchLumps[ patchName ];
        if ( ! patchLump ) continue;

        const patch = parsePatch( wad, patchLump.filepos );

        for ( let py = 0; py < patch.height; py ++ ) {

          for ( let px = 0; px < patch.width; px ++ ) {

            const srcIdx = py * patch.width + px;
            if ( patch.pixels[ srcIdx ] < 0 ) continue;

            const dx = originX + px;
            const dy = originY + py;

            if ( dx >= 0 && dx < width && dy >= 0 && dy < height ) {

              pixels[ dy * width + dx ] = patch.pixels[ srcIdx ];

            }

          }

        }

      }

      const rgba = new Uint8Array( width * height * 4 );
      const indices = new Uint8Array( width * height );

      for ( let j = 0; j < width * height; j ++ ) {

        const idx = pixels[ j ];

        if ( idx >= 0 ) {

          indices[ j ] = idx;
          rgba[ j * 4 ] = palette[ idx * 3 ];
          rgba[ j * 4 + 1 ] = palette[ idx * 3 + 1 ];
          rgba[ j * 4 + 2 ] = palette[ idx * 3 + 2 ];
          rgba[ j * 4 + 3 ] = 255;

        }

      }

      textures[ name ] = { width, height, rgba, indices };

    }

  }

  parseTextureLump( 'TEXTURE1' );
  parseTextureLump( 'TEXTURE2' );

  return textures;

}

/**
 * Parse sprite lumps from S_START..S_END.
 * Sprites use the same column-post format as patches.
 * Returns a map of lump name (e.g. "BAR1A0") → SpriteFrame.
 */
export function parseSprites( wad: WAD, palette: Palette ): Record<string, SpriteFrame> {

  const sprites: Record<string, SpriteFrame> = {};
  let inSprites = false;

  for ( const lump of wad.lumps ) {

    if ( lump.name === 'S_START' || lump.name === 'SS_START' ) {

      inSprites = true;
      continue;

    }

    if ( lump.name === 'S_END' || lump.name === 'SS_END' ) {

      inSprites = false;
      continue;

    }

    if ( ! inSprites || lump.size === 0 ) continue;

    const patch = parsePatch( wad, lump.filepos );

    // Convert palette-indexed pixels → RGBA with transparency
    const { width, height, leftOffset, topOffset, pixels } = patch;
    const rgba = new Uint8Array( width * height * 4 );

    for ( let i = 0; i < width * height; i ++ ) {

      const idx = pixels[ i ];
      if ( idx < 0 ) continue; // transparent

      rgba[ i * 4 ] = palette[ idx * 3 ];
      rgba[ i * 4 + 1 ] = palette[ idx * 3 + 1 ];
      rgba[ i * 4 + 2 ] = palette[ idx * 3 + 2 ];
      rgba[ i * 4 + 3 ] = 255;

    }

    sprites[ lump.name ] = { width, height, leftOffset, topOffset, rgba };

  }

  return sprites;

}
