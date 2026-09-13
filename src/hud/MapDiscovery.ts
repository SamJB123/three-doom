import type {DoomMapData,DoomPlayer} from '../physics/DoomMovement';
import {FRACUNIT} from '../math/fixed';

/** R_RenderBSPNode / R_AddLine / R_ClipSolidWallSegment's horizontal visibility
 * model, adapted to the Three.js camera field of view. Unlike sparse rays,
 * angular spans retain narrow visible walls. Vertical span clipping remains
 * the Three.js presentation's approximation, not software-renderer parity. */
export function visibleMapLines(map:DoomMapData,player:DoomPlayer,halfFov=Math.PI/4):Set<number> {
  const x=player.mo.x/FRACUNIT,y=player.mo.y/FRACUNIT,yaw=player.mo.angle;
  const visible=new Set<number>(),covered:[number,number][]=[];
  const stack=[map.nodes.length?map.nodes.length-1:0x8000];
  const normalize=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
  while(stack.length){
    const nodeIndex=stack.pop()!;
    if(!(nodeIndex&0x8000)){
      const node=map.nodes[nodeIndex];if(!node)continue;
      const right=node.dx===0?(x>node.x)===(node.dy>0):node.dy===0?(y<=node.y)===(node.dx>0):(x-node.x)*node.dy>(y-node.y)*node.dx;
      stack.push(right?node.leftChild:node.rightChild,right?node.rightChild:node.leftChild);continue;
    }
    const sub=map.subsectors[nodeIndex&0x7fff];if(!sub)continue;
    for(let i=sub.firstSeg;i<sub.firstSeg+sub.numSegs;i++){
      const seg=map.segs[i],line=map.linedefs[seg.linedef],a=map.vertexes[seg.v1],b=map.vertexes[seg.v2];
      if((b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x)>=0)continue;
      const side=map.sidedefs[seg.side?line.left:line.right];if(!side)continue;
      const front=map.sectors[side.sector],other=seg.side?line.right:line.left;
      const back=other<0?null:map.sectors[map.sidedefs[other].sector];
      const solid=!back||Math.min(front.ceilingHeight,back.ceilingHeight)<=Math.max(front.floorHeight,back.floorHeight);
      if(back&&!solid&&front.floorHeight===back.floorHeight&&front.ceilingHeight===back.ceilingHeight&&front.floorTex===back.floorTex&&front.ceilingTex===back.ceilingTex&&front.lightLevel===back.lightLevel&&side.middle==='-')continue;
      const first=normalize(Math.atan2(a.y-y,a.x-x)-yaw),last=first+normalize(Math.atan2(b.y-y,b.x-x)-yaw-first);
      for(const wrap of [-2*Math.PI,0,2*Math.PI]){
        const low=Math.max(-halfFov,Math.min(first,last)+wrap),high=Math.min(halfFov,Math.max(first,last)+wrap);
        if(high<=low)continue;
        let cursor=low;
        for(const [start,end] of covered){if(start>cursor)break;if(end>cursor)cursor=end;if(cursor>=high)break;}
        if(cursor>=high)continue;
        visible.add(seg.linedef);
        if(solid){
          covered.push([low,high]);covered.sort((a,b)=>a[0]-b[0]);
          for(let j=1;j<covered.length;)if(covered[j][0]<=covered[j-1][1]){covered[j-1][1]=Math.max(covered[j-1][1],covered[j][1]);covered.splice(j,1);}else j++;
        }
      }
    }
  }
  return visible;
}
