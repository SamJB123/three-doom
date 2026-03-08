// ============================================================
// Doom WAD data types
// ============================================================

export interface Lump {
  name: string;
  filepos: number;
  size: number;
  index: number;
}

export interface LumpRef {
  offset: number;
  size: number;
}

export interface WAD {
  magic: string;
  lumps: Lump[];
  lumpMap: Record<string, Lump>;
  buffer: ArrayBuffer;
  view: DataView;
  buf: Uint8Array;
}

export interface MapLumps {
  THINGS: LumpRef;
  LINEDEFS: LumpRef;
  SIDEDEFS: LumpRef;
  VERTEXES: LumpRef;
  SEGS: LumpRef;
  SSECTORS: LumpRef;
  NODES: LumpRef;
  SECTORS: LumpRef;
  REJECT: LumpRef;
  BLOCKMAP: LumpRef;
}

export interface Vertex {
  x: number;
  y: number;
}

export interface Linedef {
  v1: number;
  v2: number;
  flags: number;
  special: number;
  tag: number;
  right: number;
  left: number;
}

export interface Sidedef {
  xoff: number;
  yoff: number;
  upper: string;
  lower: string;
  middle: string;
  sector: number;
}

export interface Sector {
  floorHeight: number;
  ceilingHeight: number;
  floorTex: string;
  ceilingTex: string;
  lightLevel: number;
  special: number;
  tag: number;
}

export interface Thing {
  x: number;
  y: number;
  angle: number;
  type: number;
  flags: number;
}

export interface TextureData {
  width: number;
  height: number;
  rgba: Uint8Array;
  indices: Uint8Array; // original palette indices (for COLORMAP)
}

export interface PatchData {
  width: number;
  height: number;
  leftOffset: number;
  topOffset: number;
  pixels: Int16Array;
}

export interface Seg {
  v1: number;
  v2: number;
  angle: number;
  linedef: number;
  side: number;
  offset: number;
}

export interface Subsector {
  numSegs: number;
  firstSeg: number;
}

export interface BspNode {
  x: number;        // partition line start
  y: number;
  dx: number;       // partition line direction
  dy: number;
  rightChild: number;  // bit 15 set = subsector index
  leftChild: number;
}

export interface SpriteFrame {
  width: number;
  height: number;
  leftOffset: number;   // pixels to the left of the center
  topOffset: number;    // pixels above the bottom (foot level)
  rgba: Uint8Array;
}

export type Palette = Uint8Array; // 256 * 3 RGB values
