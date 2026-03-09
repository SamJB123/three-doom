// P_CheckSight — line-of-sight checking via BSP traversal.
// Ported from p_sight.c. Used by enemy AI to detect the player.
//
// Algorithm:
// 1. Quick-reject via REJECT lump (sector pair bitmap)
// 2. Trace a ray from source eye height to target body via BSP tree
// 3. At each two-sided linedef crossing, narrow a vertical "corridor"
//    (topSlope / bottomSlope). If the corridor closes, LOS is blocked.
//
// ALL coordinates are in Doom fixed-point (16.16) to match mobj positions.

import type { Mobj } from './Mobj';
import type { DoomMapData } from '../physics/DoomMovement';
import { fixedDiv, intToFixed, FRACUNIT, FRACBITS } from '../math/fixed';

// ============================================================
// DivLine — a line defined by origin + delta (fixed-point)
// ============================================================

interface DivLine {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

// ============================================================
// Sight trace state
// ============================================================

interface SightTraceState {
  sightZStart: number;   // fixed-point: source eye height
  topSlope: number;      // fixed-point: current upper slope bound
  bottomSlope: number;   // fixed-point: current lower slope bound
  trace: DivLine;        // fixed-point: ray origin + delta
  t2x: number;           // fixed-point: target x
  t2y: number;           // fixed-point: target y
}

// Per-linedef stamp to avoid re-checking the same linedef twice in one trace
let validCount = 0;
let lineValidCount: Int32Array | null = null;

function ensureValidArray( numLinedefs: number ): void {

  if ( ! lineValidCount || lineValidCount.length < numLinedefs ) {

    lineValidCount = new Int32Array( numLinedefs );

  }

}

// ============================================================
// Determine which side of a divline a point is on
// All args in fixed-point.
// Returns: 0 = front/left, 1 = back/right, 2 = on line
// ============================================================

function divlineSide( x: number, y: number, node: DivLine ): 0 | 1 | 2 {

  if ( node.dx === 0 ) {

    if ( x === node.x ) return 2;
    return x <= node.x ? ( node.dy > 0 ? 1 : 0 ) : ( node.dy < 0 ? 1 : 0 );

  }

  if ( node.dy === 0 ) {

    if ( y === node.y ) return 2;
    return y <= node.y ? ( node.dx < 0 ? 1 : 0 ) : ( node.dx > 0 ? 1 : 0 );

  }

  const dx = x - node.x;
  const dy = y - node.y;

  // Cross product: (node.dy * dx) vs (dy * node.dx)
  // Scale down to avoid overflow
  const left = ( node.dy >> FRACBITS ) * ( dx >> FRACBITS );
  const right = ( dy >> FRACBITS ) * ( node.dx >> FRACBITS );

  if ( right < left ) return 0;
  if ( left === right ) return 2;
  return 1;

}

// ============================================================
// Intercept vector — fraction along v2 where v1 crosses it
// Both args in fixed-point. Returns fixed-point fraction.
// ============================================================

function interceptVector( v2: DivLine, v1: DivLine ): number {

  const den = ( ( ( v1.dy >> 8 ) * v2.dx - ( v1.dx >> 8 ) * v2.dy ) >> 16 );
  if ( den === 0 ) return 0;

  const num = ( ( ( ( v1.x - v2.x ) >> 8 ) * v1.dy ) + ( ( ( v2.y - v1.y ) >> 8 ) * v1.dx ) ) >> 16;
  return fixedDiv( num, den );

}

// ============================================================
// Cross a subsector — check all segs for LOS blocking
// ============================================================

function crossSubsector(
  map: DoomMapData,
  subsectorIndex: number,
  sight: SightTraceState,
  vc: number
): boolean {

  const sub = map.subsectors[ subsectorIndex ];
  if ( ! sub ) return false;

  const end = sub.firstSeg + sub.numSegs;

  for ( let i = sub.firstSeg; i < end; i ++ ) {

    const seg = map.segs[ i ];
    if ( ! seg ) continue;

    const lineIdx = seg.linedef;
    const line = map.linedefs[ lineIdx ];
    if ( ! line ) continue;

    // Skip already-checked linedefs
    if ( lineValidCount![ lineIdx ] === vc ) continue;
    lineValidCount![ lineIdx ] = vc;

    // Convert vertex coords to fixed-point
    const v1 = map.vertexes[ line.v1 ];
    const v2 = map.vertexes[ line.v2 ];
    const v1x = intToFixed( v1.x );
    const v1y = intToFixed( v1.y );
    const v2x = intToFixed( v2.x );
    const v2y = intToFixed( v2.y );

    // Check if trace crosses this linedef
    const s1 = divlineSide( v1x, v1y, sight.trace );
    const s2 = divlineSide( v2x, v2y, sight.trace );
    if ( s1 === s2 ) continue;

    const div: DivLine = {
      x: v1x, y: v1y,
      dx: v2x - v1x, dy: v2y - v1y
    };

    const p1 = divlineSide( sight.trace.x, sight.trace.y, div );
    const p2 = divlineSide( sight.t2x, sight.t2y, div );
    if ( p1 === p2 ) continue;

    // One-sided line blocks LOS
    if ( line.left < 0 ) return false;

    const frontSectorIdx = map.sidedefs[ line.right ].sector;
    const backSectorIdx = map.sidedefs[ line.left ].sector;
    const front = map.sectors[ frontSectorIdx ];
    const back = map.sectors[ backSectorIdx ];

    // Same height on both sides — doesn't block
    if ( front.floorHeight === back.floorHeight &&
         front.ceilingHeight === back.ceilingHeight ) continue;

    // Convert sector heights to fixed-point
    const openTop = intToFixed( Math.min( front.ceilingHeight, back.ceilingHeight ) );
    const openBottom = intToFixed( Math.max( front.floorHeight, back.floorHeight ) );

    // Closed gap
    if ( openBottom >= openTop ) return false;

    const frac = interceptVector( sight.trace, div );

    if ( front.floorHeight !== back.floorHeight ) {

      const slope = fixedDiv( openBottom - sight.sightZStart, frac );
      if ( slope > sight.bottomSlope ) sight.bottomSlope = slope;

    }

    if ( front.ceilingHeight !== back.ceilingHeight ) {

      const slope = fixedDiv( openTop - sight.sightZStart, frac );
      if ( slope < sight.topSlope ) sight.topSlope = slope;

    }

    if ( sight.topSlope <= sight.bottomSlope ) return false;

  }

  return true;

}

// ============================================================
// Recursively traverse BSP nodes
// ============================================================

function crossBspNode(
  map: DoomMapData,
  nodeIndex: number,
  sight: SightTraceState,
  vc: number
): boolean {

  // Leaf node — subsector
  if ( nodeIndex & 0x8000 ) {

    return crossSubsector(
      map,
      nodeIndex === - 1 ? 0 : ( nodeIndex & ~0x8000 ),
      sight, vc
    );

  }

  const node = map.nodes[ nodeIndex ];
  if ( ! node ) return true;

  // BSP node partition line — convert to fixed-point
  const nodeDiv: DivLine = {
    x: intToFixed( node.x ), y: intToFixed( node.y ),
    dx: intToFixed( node.dx ), dy: intToFixed( node.dy )
  };

  let side = divlineSide( sight.trace.x, sight.trace.y, nodeDiv );
  if ( side === 2 ) side = 0;

  // Traverse the side the trace starts on
  const nearChild = side === 0 ? node.rightChild : node.leftChild;
  if ( ! crossBspNode( map, nearChild, sight, vc ) ) return false;

  // If the endpoint is on the same side, we're done
  if ( side === divlineSide( sight.t2x, sight.t2y, nodeDiv ) ) return true;

  // Traverse the other side
  const farChild = side === 0 ? node.leftChild : node.rightChild;
  return crossBspNode( map, farChild, sight, vc );

}

// ============================================================
// P_CheckSight — can source see target?
// Uses BSP to trace LOS, narrowing the vertical band at each
// two-sided linedef crossing until it closes.
// ============================================================

export function P_CheckSight(
  t1: Mobj,
  t2: Mobj,
  map: DoomMapData,
  rejectMatrix?: Uint8Array
): boolean {

  // Reject matrix quick-rejection
  if ( rejectMatrix && rejectMatrix.length > 0 &&
       t1.sectorIndex >= 0 && t2.sectorIndex >= 0 ) {

    const pnum = t1.sectorIndex * map.sectors.length + t2.sectorIndex;
    const bytenum = pnum >> 3;
    const bitnum = 1 << ( pnum & 7 );

    if ( ( ( rejectMatrix[ bytenum ] ?? 0 ) & bitnum ) !== 0 ) return false;

  }

  ensureValidArray( map.linedefs.length );
  validCount ++;

  // Eye height at 3/4 up the source mobj (fixed-point)
  const sightZStart = t1.z + t1.height - ( t1.height >> 2 );

  const sight: SightTraceState = {
    sightZStart,
    topSlope: ( t2.z + t2.height ) - sightZStart,
    bottomSlope: t2.z - sightZStart,
    trace: {
      x: t1.x, y: t1.y,
      dx: t2.x - t1.x, dy: t2.y - t1.y
    },
    t2x: t2.x,
    t2y: t2.y
  };

  if ( map.nodes.length === 0 ) return true;

  return crossBspNode( map, map.nodes.length - 1, sight, validCount );

}
