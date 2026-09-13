import type { WAD, Lump, LumpRef, MapLumps } from './types';

const MAP_SUB_LUMPS = [
  'THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS',
  'SSECTORS', 'NODES', 'SECTORS', 'REJECT', 'BLOCKMAP'
];

export function readStr( buf: Uint8Array, off: number, len: number ): string {

  let s = '';

  for ( let j = 0; j < len; j ++ ) {

    const c = buf[ off + j ];
    if ( c === 0 ) break;
    s += String.fromCharCode( c );

  }

  return s.toUpperCase();

}

export function parseWAD( buffer: ArrayBuffer ): WAD {

  if (buffer.byteLength < 12) throw new Error('Truncated WAD header');
  const buf = new Uint8Array( buffer );
  const view = new DataView( buffer );
  const magic = String.fromCharCode( buf[ 0 ], buf[ 1 ], buf[ 2 ], buf[ 3 ] );

  if ( magic !== 'IWAD' && magic !== 'PWAD' ) {

    throw new Error( 'Not a WAD file' );

  }

  const numLumps = view.getInt32( 4, true );
  const dirOffset = view.getInt32( 8, true );
  if (numLumps < 0 || dirOffset < 12 || dirOffset > buffer.byteLength ||
      numLumps > Math.floor((buffer.byteLength - dirOffset) / 16)) {
    throw new Error('Invalid WAD directory bounds');
  }
  const lumps: Lump[] = [];
  const lumpMap: Record<string, Lump> = Object.create(null);

  for ( let i = 0; i < numLumps; i ++ ) {

    const off = dirOffset + i * 16;
    const filepos = view.getInt32( off, true );
    const size = view.getInt32( off + 4, true );
    const name = readStr( buf, off + 8, 8 );
    if (filepos < 0 || size < 0 || filepos > buffer.byteLength || size > buffer.byteLength - filepos) {
      throw new Error(`Invalid WAD lump bounds: ${name}`);
    }

    const lump: Lump = { name, filepos, size, index: i };
    lumps.push( lump );

    // W_CheckNumForName searches backward: later lumps override earlier ones.
    lumpMap[ name ] = lump;

  }

  return { magic, lumps, lumpMap, buffer, view, buf };

}

export function getLump( wad: WAD, name: string ): LumpRef | null {

  const l = wad.lumpMap[ name.toUpperCase() ];
  if ( ! l ) return null;
  return { offset: l.filepos, size: l.size };

}

export function getMapLumps( wad: WAD, mapName: string ): MapLumps {

  const result: Record<string, LumpRef> = {};
  const marker = wad.lumpMap[mapName.toUpperCase()];
  if (!marker) throw new Error(`Missing map: ${mapName}`);
  for (let i = 0; i < MAP_SUB_LUMPS.length; i++) {
    const lump = wad.lumps[marker.index + 1 + i];
    if (!lump || lump.name !== MAP_SUB_LUMPS[i]) {
      throw new Error(`Missing map lump: ${MAP_SUB_LUMPS[i]} in ${mapName}`);
    }
    result[lump.name] = {offset: lump.filepos, size: lump.size};
  }

  function require( name: string ): LumpRef {

    const ref = result[ name ];
    if ( ! ref ) throw new Error( `Missing map lump: ${ name } in ${ mapName }` );
    return ref;

  }

  return {
    THINGS: require( 'THINGS' ),
    LINEDEFS: require( 'LINEDEFS' ),
    SIDEDEFS: require( 'SIDEDEFS' ),
    VERTEXES: require( 'VERTEXES' ),
    SEGS: require( 'SEGS' ),
    SSECTORS: require( 'SSECTORS' ),
    NODES: require( 'NODES' ),
    SECTORS: require( 'SECTORS' ),
    REJECT: require( 'REJECT' ),
    BLOCKMAP: require( 'BLOCKMAP' )
  };

}
