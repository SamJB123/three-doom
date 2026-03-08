import type { WAD, LumpRef, Vertex, Linedef, Sidedef, Sector, Thing, Seg, Subsector, BspNode } from './types';
import { readStr } from './WADParser';

export function parseVertexes( wad: WAD, lump: LumpRef ): Vertex[] {

  const verts: Vertex[] = [];
  const view = wad.view;
  const count = lump.size / 4;

  for ( let i = 0; i < count; i ++ ) {

    const off = lump.offset + i * 4;
    verts.push( {
      x: view.getInt16( off, true ),
      y: view.getInt16( off + 2, true )
    } );

  }

  return verts;

}

export function parseLinedefs( wad: WAD, lump: LumpRef ): Linedef[] {

  const lines: Linedef[] = [];
  const view = wad.view;
  const count = lump.size / 14;

  for ( let i = 0; i < count; i ++ ) {

    const off = lump.offset + i * 14;
    lines.push( {
      v1: view.getUint16( off, true ),
      v2: view.getUint16( off + 2, true ),
      flags: view.getUint16( off + 4, true ),
      special: view.getUint16( off + 6, true ),
      tag: view.getUint16( off + 8, true ),
      right: view.getInt16( off + 10, true ),
      left: view.getInt16( off + 12, true )
    } );

  }

  return lines;

}

export function parseSidedefs( wad: WAD, lump: LumpRef ): Sidedef[] {

  const sides: Sidedef[] = [];
  const view = wad.view;
  const buf = wad.buf;
  const count = lump.size / 30;

  for ( let i = 0; i < count; i ++ ) {

    const off = lump.offset + i * 30;
    sides.push( {
      xoff: view.getInt16( off, true ),
      yoff: view.getInt16( off + 2, true ),
      upper: readStr( buf, off + 4, 8 ),
      lower: readStr( buf, off + 12, 8 ),
      middle: readStr( buf, off + 20, 8 ),
      sector: view.getUint16( off + 28, true )
    } );

  }

  return sides;

}

export function parseSectors( wad: WAD, lump: LumpRef ): Sector[] {

  const sectors: Sector[] = [];
  const view = wad.view;
  const buf = wad.buf;
  const count = lump.size / 26;

  for ( let i = 0; i < count; i ++ ) {

    const off = lump.offset + i * 26;
    sectors.push( {
      floorHeight: view.getInt16( off, true ),
      ceilingHeight: view.getInt16( off + 2, true ),
      floorTex: readStr( buf, off + 4, 8 ),
      ceilingTex: readStr( buf, off + 12, 8 ),
      lightLevel: view.getInt16( off + 20, true ),
      special: view.getUint16( off + 22, true ),
      tag: view.getUint16( off + 24, true )
    } );

  }

  return sectors;

}

export function parseThings( wad: WAD, lump: LumpRef ): Thing[] {

  const things: Thing[] = [];
  const view = wad.view;
  const count = lump.size / 10;

  for ( let i = 0; i < count; i ++ ) {

    const off = lump.offset + i * 10;
    things.push( {
      x: view.getInt16( off, true ),
      y: view.getInt16( off + 2, true ),
      angle: view.getInt16( off + 4, true ),
      type: view.getUint16( off + 6, true ),
      flags: view.getUint16( off + 8, true )
    } );

  }

  return things;

}

export function parseSegs( wad: WAD, lump: LumpRef ): Seg[] {

  const segs: Seg[] = [];
  const view = wad.view;
  const count = lump.size / 12;

  for ( let i = 0; i < count; i ++ ) {

    const off = lump.offset + i * 12;
    segs.push( {
      v1: view.getUint16( off, true ),
      v2: view.getUint16( off + 2, true ),
      angle: view.getInt16( off + 4, true ),
      linedef: view.getUint16( off + 6, true ),
      side: view.getInt16( off + 8, true ),
      offset: view.getInt16( off + 10, true )
    } );

  }

  return segs;

}

export function parseSubsectors( wad: WAD, lump: LumpRef ): Subsector[] {

  const subs: Subsector[] = [];
  const view = wad.view;
  const count = lump.size / 4;

  for ( let i = 0; i < count; i ++ ) {

    const off = lump.offset + i * 4;
    subs.push( {
      numSegs: view.getUint16( off, true ),
      firstSeg: view.getUint16( off + 2, true )
    } );

  }

  return subs;

}

export function parseNodes( wad: WAD, lump: LumpRef ): BspNode[] {

  const nodes: BspNode[] = [];
  const view = wad.view;
  const count = lump.size / 28;

  for ( let i = 0; i < count; i ++ ) {

    const off = lump.offset + i * 28;
    nodes.push( {
      x: view.getInt16( off, true ),
      y: view.getInt16( off + 2, true ),
      dx: view.getInt16( off + 4, true ),
      dy: view.getInt16( off + 6, true ),
      // Skip bounding boxes (16 bytes: off+8 to off+23)
      rightChild: view.getUint16( off + 24, true ),
      leftChild: view.getUint16( off + 26, true )
    } );

  }

  return nodes;

}
