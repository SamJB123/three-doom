import type {Vertex,Linedef,Sidedef,TextureData} from '../wad/types';

/** Presentation enhancement: wrap uniformly authored scrolling loops continuously.
 * Keep simulation offsets untouched. Only unbranched closed loops with matching
 * texture/offset/sector data qualify; ordinary authored walls keep their mapping.
 */
export function scrollingLoops(vertices:Vertex[],lines:Linedef[],sides:Sidedef[],textures:Record<string,TextureData>):Map<Sidedef,Map<string,{phase:number;scale:number}>> {
  const result=new Map<Sidedef,Map<string,{phase:number;scale:number}>>();
  for(const slot of ['upper','middle','lower'] as const){
    const groups=new Map<string,Linedef[]>();
    for(const line of lines){
      if(line.special!==48||line.right<0)continue;
      const side=sides[line.right],tex=side[slot];
      if(!textures[tex])continue;
      const key=JSON.stringify([side.sector,line.left<0?-1:sides[line.left].sector,tex,side.xoff,side.yoff]);
      const group=groups.get(key)??[];group.push(line);groups.set(key,group);
    }
    for(const group of groups.values()){
      const outgoing=new Map<number,Linedef[]>(),incoming=new Map<number,Linedef[]>();
      for(const line of group){
        outgoing.set(line.v1,[...(outgoing.get(line.v1)??[]),line]);
        incoming.set(line.v2,[...(incoming.get(line.v2)??[]),line]);
      }
      const visited=new Set<Linedef>();
      for(const first of group){
        if(visited.has(first))continue;
        const loop:Linedef[]=[];let line:Linedef|undefined=first;
        while(line&&!visited.has(line)){
          if(outgoing.get(line.v1)?.length!==1||incoming.get(line.v1)?.length!==1)break;
          visited.add(line);loop.push(line);line=outgoing.get(line.v2)?.[0];
        }
        if(line!==first||loop.length<3)continue;
        const lengths=loop.map(l=>Math.hypot(vertices[l.v2].x-vertices[l.v1].x,vertices[l.v2].y-vertices[l.v1].y));
        const perimeter=lengths.reduce((a,b)=>a+b,0);
        if(!perimeter||lengths.some(length=>!length))continue;
        const width=textures[sides[first.right][slot]].width;
        // A closed loop must contain a whole number of texture repeats.
        const scale=Math.max(1,Math.round(perimeter/width))*width/perimeter;
        let distance=0;
        loop.forEach((edge,index)=>{
          const side=sides[edge.right],entries=result.get(side)??new Map();
          entries.set(side[slot],{phase:distance*scale/width,scale});result.set(side,entries);
          distance+=lengths[index];
        });
      }
    }
  }
  return result;
}
