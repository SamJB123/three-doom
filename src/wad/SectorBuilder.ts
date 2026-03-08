import earcut from 'earcut';
import type { Vertex, Linedef, Sidedef } from './types';

export function buildSectorPolygons(
  sectorIndex: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  vertexes: Vertex[]
): number[][] {

  const sectorLines: { v1: number; v2: number }[] = [];

  for ( let i = 0; i < linedefs.length; i ++ ) {

    const ld = linedefs[ i ];

    if ( ld.right >= 0 && sidedefs[ ld.right ].sector === sectorIndex ) {

      sectorLines.push( { v1: ld.v1, v2: ld.v2 } );

    }

    if ( ld.left >= 0 && sidedefs[ ld.left ].sector === sectorIndex ) {

      sectorLines.push( { v1: ld.v2, v2: ld.v1 } );

    }

  }

  if ( sectorLines.length === 0 ) return [];

  const used = new Set<number>();
  const loops: number[][] = [];

  for ( let startIdx = 0; startIdx < sectorLines.length; startIdx ++ ) {

    if ( used.has( startIdx ) ) continue;

    const loop: number[] = [];
    let current = startIdx;
    let safety = 0;

    while ( ! used.has( current ) && safety < 10000 ) {

      used.add( current );
      const edge = sectorLines[ current ];
      loop.push( edge.v1 );
      safety ++;

      let found = - 1;

      for ( let j = 0; j < sectorLines.length; j ++ ) {

        if ( ! used.has( j ) && sectorLines[ j ].v1 === edge.v2 ) {

          found = j;
          break;

        }

      }

      if ( found === - 1 ) break;
      current = found;

    }

    if ( loop.length >= 3 ) loops.push( loop );

  }

  return loops;

}

export function triangulate( vertices2D: number[] ): number[] {

  if ( vertices2D.length < 6 ) return [];
  return earcut( vertices2D );

}
