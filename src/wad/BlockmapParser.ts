import type { WAD, LumpRef, Linedef, Vertex } from './types';

// Doom BLOCKMAP: a grid-based spatial index for linedefs
// Used for collision detection — quickly find which linedefs are in a given grid cell
//
// Header: originX (int16), originY (int16), columns (int16), rows (int16)
// Then columns*rows uint16 offsets into a blocklist array
// Each blocklist: 0x0000 header, linedef indices..., 0xFFFF terminator

export interface Blockmap {
  originX: number;
  originY: number;
  columns: number;
  rows: number;
  blockSize: number; // always 128 Doom units
  lists: number[][]; // lists[blockIndex] = array of linedef indices
}

export function parseBlockmap( wad: WAD, lump: LumpRef ): Blockmap {

  const view = wad.view;
  const off = lump.offset;

  const end=off+lump.size;
  if(lump.size<8||lump.size%2||off<0||end>wad.buf.length)throw Error('Invalid BLOCKMAP header');
  const originX = view.getInt16( off, true );
  const originY = view.getInt16( off + 2, true );
  const columns = view.getUint16( off + 4, true );
  const rows = view.getUint16( off + 6, true );

  const numBlocks = columns * rows;
  if(!columns||!rows||numBlocks>(lump.size-8)/2)throw Error('Invalid BLOCKMAP dimensions');
  const lists: number[][] = [];
  const cached=new Map<number,number[]>();

  for ( let i = 0; i < numBlocks; i ++ ) {

    // Each offset is in 16-bit words from the start of the lump
    const blockOffset = view.getUint16( off + 8 + i * 2, true );
    const existing=cached.get(blockOffset);if(existing){lists.push(existing);continue;}
    const linedefIndices:number[]=[];
    let pos=off+blockOffset*2;
    if(pos<off+8+numBlocks*2||pos+2>end||view.getUint16(pos,true)!==0)throw Error('Invalid BLOCKMAP list offset/header');
    pos+=2;
    while(true){
      if(pos+2>end)throw Error('Unterminated BLOCKMAP list');
      const value=view.getUint16(pos,true);pos+=2;
      if(value===0xffff)break;
      linedefIndices.push(value);
    }
    cached.set(blockOffset,linedefIndices);

    lists.push( linedefIndices );

  }

  return {
    originX,
    originY,
    columns,
    rows,
    blockSize: 128,
    lists
  };

}

// Get the block index for a given world position
export function getBlockIndex( blockmap: Blockmap, x: number, y: number ): number {

  const col = Math.floor( ( x - blockmap.originX ) / blockmap.blockSize );
  const row = Math.floor( ( y - blockmap.originY ) / blockmap.blockSize );

  if ( col < 0 || col >= blockmap.columns || row < 0 || row >= blockmap.rows ) {

    return - 1;

  }

  return row * blockmap.columns + col;

}

// Get all linedef indices that could collide with a point
export function getLindefsAtPoint( blockmap: Blockmap, x: number, y: number ): number[] {

  const idx = getBlockIndex( blockmap, x, y );
  if ( idx < 0 ) return [];
  return blockmap.lists[ idx ];

}

// Get all linedef indices in a bounding box (for broad-phase)
export function getLinedefsInBounds(
  blockmap: Blockmap,
  minX: number, minY: number,
  maxX: number, maxY: number
): Set<number> {

  const result = new Set<number>();

  const colMin = Math.max( 0, Math.floor( ( minX - blockmap.originX ) / blockmap.blockSize ) );
  const colMax = Math.min( blockmap.columns - 1, Math.floor( ( maxX - blockmap.originX ) / blockmap.blockSize ) );
  const rowMin = Math.max( 0, Math.floor( ( minY - blockmap.originY ) / blockmap.blockSize ) );
  const rowMax = Math.min( blockmap.rows - 1, Math.floor( ( maxY - blockmap.originY ) / blockmap.blockSize ) );

  for ( let row = rowMin; row <= rowMax; row ++ ) {

    for ( let col = colMin; col <= colMax; col ++ ) {

      const idx = row * blockmap.columns + col;
      const list = blockmap.lists[ idx ];

      for ( const lineIdx of list ) {

        result.add( lineIdx );

      }

    }

  }

  return result;

}
