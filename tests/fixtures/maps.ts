import type { DoomMapData } from '../../src/physics/DoomMovement.ts';
import type { Sector } from '../../src/wad';
export function sector(floorHeight = 0, ceilingHeight = 128): Sector {
  return {floorHeight, ceilingHeight, floorTex:'FLOOR0_1', ceilingTex:'CEIL1_1', lightLevel:160, special:0, tag:0, soundX:0, soundY:0};
}
// Two sectors divided by a north-facing line. Right/front is x > 0.
export function dividedMap(): DoomMapData {
  return {
    vertexes:[{x:0,y:-128},{x:0,y:128}],
    linedefs:[{v1:0,v2:1,flags:4,special:0,tag:0,right:0,left:1}],
    sidedefs:[0,1].map(sector => ({sector,xoff:0,yoff:0,upper:'-',middle:'SW1BRCOM',lower:'-'})),
    sectors:[sector(),sector()],
    segs:[{v1:0,v2:1,angle:0,linedef:0,side:0,offset:0},{v1:1,v2:0,angle:0,linedef:0,side:1,offset:0}],
    subsectors:[{segCount:1,firstSeg:0},{segCount:1,firstSeg:1}],
    nodes:[{x:0,y:0,dx:0,dy:256,rightChild:0x8000,leftChild:0x8001,rightBBox:[128,-128,0,128],leftBBox:[128,-128,-128,0]}] as DoomMapData['nodes'],
    blockmap:{originX:-128,originY:-128,columns:2,rows:2,blockSize:128,lists:[[0],[0],[0],[0]]},
    mobjs:[]
  };
}
