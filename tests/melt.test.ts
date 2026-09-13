import test from 'node:test';
import assert from 'node:assert/strict';
import {Melt} from '../src/game/Melt';
import {archiveRandom,restoreRandom} from '../src/game/DoomRandom';
test('wipe_initMelt consumes cosmetic RNG for the full screen width only',()=>{
  restoreRandom({play:123,misc:0});const melt=new Melt();
  assert.equal(archiveRandom().play,123);assert.equal(archiveRandom().misc,320%256);
  assert.equal(melt.columns.length,320);
  for(let i=0;i<320;i++){assert(melt.columns[i]>=-15&&melt.columns[i]<=0);if(i)assert(Math.abs(melt.columns[i]-melt.columns[i-1])<=1);}
});
test('wipe_doMelt accelerates paired columns and finishes only after every column settles',()=>{
  const melt=new Melt(4,40,()=>0);assert.deepEqual(melt.columns,[0,-1,-2,-3]);
  melt.tick();assert.deepEqual(melt.columns.slice(0,2),[1,0]);
  melt.tick();assert.deepEqual(melt.columns.slice(0,2),[3,1]);
  melt.tick();assert.deepEqual(melt.columns.slice(0,2),[7,3]);
  melt.tick();assert.deepEqual(melt.columns.slice(0,2),[15,7]);
  melt.tick();assert.deepEqual(melt.columns.slice(0,2),[31,15]);
  let count=0;while(!melt.tick()){assert(count++<50);}
  assert.deepEqual(melt.columns.slice(0,2),[40,40]);assert.equal(melt.columns[2],-2);
});
test('every melt tic matches executed original f_wipe.c',async()=>{
  const {readFileSync}=await import('node:fs');
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/melt-reference.json',import.meta.url),'utf8'));
  let draw=0;const melt=new Melt(fixture.width,fixture.height,()=>(draw++*17)&255);
  for(let tic=0;tic<fixture.frames.length;tic++){
    if(tic)melt.tick();
    assert.deepEqual({done:melt.done,columns:melt.columns.slice(0,fixture.width/2)},fixture.frames[tic],`tic ${tic}`);
  }
});
