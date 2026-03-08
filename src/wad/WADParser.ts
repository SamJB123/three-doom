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

  const buf = new Uint8Array( buffer );
  const view = new DataView( buffer );
  const magic = String.fromCharCode( buf[ 0 ], buf[ 1 ], buf[ 2 ], buf[ 3 ] );

  if ( magic !== 'IWAD' && magic !== 'PWAD' ) {

    throw new Error( 'Not a WAD file' );

  }

  const numLumps = view.getInt32( 4, true );
  const dirOffset = view.getInt32( 8, true );
  const lumps: Lump[] = [];
  const lumpMap: Record<string, Lump> = {};

  for ( let i = 0; i < numLumps; i ++ ) {

    const off = dirOffset + i * 16;
    const filepos = view.getInt32( off, true );
    const size = view.getInt32( off + 4, true );
    const name = readStr( buf, off + 8, 8 );

    const lump: Lump = { name, filepos, size, index: i };
    lumps.push( lump );

    if ( ! lumpMap[ name ] ) lumpMap[ name ] = lump;

  }

  return { magic, lumps, lumpMap, buffer, view, buf };

}

export function getLump( wad: WAD, name: string ): LumpRef | null {

  const l = wad.lumpMap[ name ];
  if ( ! l ) return null;
  return { offset: l.filepos, size: l.size };

}

export function getMapLumps( wad: WAD, mapName: string ): MapLumps {

  const result: Record<string, LumpRef> = {};
  let found = false;

  for ( const lump of wad.lumps ) {

    if ( lump.name === mapName ) {

      found = true;
      continue;

    }

    if ( found ) {

      if ( ! MAP_SUB_LUMPS.includes( lump.name ) ) break;
      result[ lump.name ] = { offset: lump.filepos, size: lump.size };

    }

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
