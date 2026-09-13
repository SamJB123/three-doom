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
    // Self-referencing linedefs are internal detail, not sector boundaries.
    if(ld.left>=0 && ld.right>=0 && sidedefs[ld.left].sector===sectorIndex && sidedefs[ld.right].sector===sectorIndex)continue;

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

// Group boundary rings by containment. Odd depths are holes; even depths are
// outer boundaries or islands inside holes. Winding alone is insufficient for
// disconnected sectors and maps with mixed line orientation.
export function triangulateSector(loops: number[][], vertices: Vertex[]): {vertices:number[];triangles:number[]}[] {
  const area=(loop:number[])=>Math.abs(loop.reduce((sum,index,i)=>{
    const a=vertices[index],b=vertices[loop[(i+1)%loop.length]];return sum+a.x*b.y-b.x*a.y;
  },0)/2);
  const contains=(loop:number[],p:Vertex)=>{
    let inside=false;
    for(let i=0,j=loop.length-1;i<loop.length;j=i++){
      const a=vertices[loop[i]],b=vertices[loop[j]];
      if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  };
  const rings=loops.filter(loop=>area(loop)>0).map(loop=>({loop,area:area(loop),parent:-1,depth:0}));
  rings.forEach((ring,i)=>{
    let enclosing=Infinity;
    rings.forEach((other,j)=>{
      if(i!==j && other.area>ring.area && other.area<enclosing && contains(other.loop,vertices[ring.loop[0]])){
        ring.parent=j;enclosing=other.area;
      }
    });
  });
  rings.forEach(ring=>{for(let parent=ring.parent;parent>=0;parent=rings[parent].parent)ring.depth++;});
  return rings.flatMap((ring,i)=>{
    if(ring.depth%2)return [];
    const indices=[...ring.loop],holes:number[]=[];
    rings.forEach(hole=>{if(hole.parent===i){holes.push(indices.length);indices.push(...hole.loop);}});
    const coords=indices.flatMap(index=>[vertices[index].x,vertices[index].y]);
    return [{vertices:indices,triangles:earcut(coords,holes)}];
  });
}
