import type {Mobj} from '../game/Mobj';
import {MF_NOBLOCKMAP} from '../game/MobjData';
import type {DoomMapData} from './DoomMovement';
const F=65536;
/** P_SetThingPosition inserts at the head, even when staying in the same block. */
export function linkThing(mo:Mobj,map:DoomMapData):void {
  if(mo.flags&MF_NOBLOCKMAP)return;
  mo.blockOrder=map.thingLinkSequence=(map.thingLinkSequence??0)+1;
}
export function restoreThingLinks(map:DoomMapData):void {
  let last=0;
  for(const [i,mo] of (map.mobjs??[]).entries()){
    last=Math.max(last,mo.blockOrder??i+1);
  }
  map.thingLinkSequence=last;
}
/** P_BlockThingsIterator in P_CheckPosition's x-major/y-minor block range. */
export function thingsInBounds(map:DoomMapData,left:number,bottom:number,right:number,top:number):Mobj[] {
  const b=map.blockmap,xl=(left-b.originX*F)>>23,xh=(right-b.originX*F)>>23;
  const yl=(bottom-b.originY*F)>>23,yh=(top-b.originY*F)>>23;
  const result:Mobj[]=[];
  for(let x=Math.max(0,xl);x<=Math.min(b.columns-1,xh);x++)for(let y=Math.max(0,yl);y<=Math.min(b.rows-1,yh);y++){
    const entries=(map.mobjs??[]).map((mo,i)=>({mo,order:mo.blockOrder??i+1})).filter(({mo})=>!mo.removed&&!(mo.flags&MF_NOBLOCKMAP)&&((mo.x-b.originX*F)>>23)===x&&((mo.y-b.originY*F)>>23)===y);
    entries.sort((a,b)=>b.order-a.order);result.push(...entries.map(e=>e.mo));
  }
  return result;
}
