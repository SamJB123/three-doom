import test from 'node:test';
import assert from 'node:assert/strict';
import {scrollingLoops} from '../src/renderer/ScrollingLoops';
import type {TextureData} from '../src/wad/types';
function fixture(){
  const vertices=[[0,0],[32,0],[48,16],[48,48],[32,64],[0,64],[-16,48],[-16,16]].map(([x,y])=>({x,y}));
  const sides=vertices.map(()=>({sector:0,xoff:8,yoff:0,upper:'-',middle:'-',lower:'TECH'}));
  const lines=vertices.map((_,i)=>({v1:i,v2:(i+1)%8,right:i,left:-1,special:48,flags:0,tag:0}));
  return {vertices,sides,lines,textures:{TECH:{width:128,height:128} as TextureData}};
}
test('scrolling loop joins every endpoint including closure without modifying WAD offsets',()=>{
  const {vertices,sides,lines,textures}=fixture();
  const mapping=scrollingLoops(vertices,lines,sides,textures);assert.equal(mapping.size,8);
  for(const tic of [0,1,127,128,10000000]){
    for(let i=0;i<8;i++){
      const current=mapping.get(sides[i])!.get('TECH')!,next=mapping.get(sides[(i+1)%8])!.get('TECH')!;
      const a=vertices[i],b=vertices[(i+1)%8],span=Math.hypot(b.x-a.x,b.y-a.y)*current.scale/128;
      const end=(8+tic)%128/128+current.phase+span,start=(8+tic)%128/128+next.phase;
      assert(Math.abs(end-start-Math.round(end-start))<1e-10);
    }
  }
  assert(sides.every(side=>side.xoff===8));
  assert.deepEqual(scrollingLoops(vertices,lines,sides,textures),mapping);
});
test('open, branched and individually offset scroll walls retain their authored mapping',()=>{
  for(const change of ['open','branch','offset','texture','special']){
    const {vertices,sides,lines,textures}=fixture();
    if(change==='open')lines.pop();
    if(change==='branch')lines.push({...lines[0],v2:3});
    if(change==='offset')sides[3].xoff=24;
    if(change==='texture')sides[3].lower='-';
    if(change==='special')lines[3].special=0;
    assert.equal(scrollingLoops(vertices,lines,sides,textures).size,0,change);
  }
});
