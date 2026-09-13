import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/slide-reference.json';
import {slideProjection} from '../src/physics/SlideProjection';
test('P_HitSlideLine matches executed C projection across wall slopes, sides and movement directions',()=>{
  for(const c of fixture.cases)assert.deepEqual(slideProjection(c.x,c.y,c.dx,c.dy,c.side),c.result,JSON.stringify(c));
});

test('P_XYMovement halves a negative odd component with C division before shifting the remainder',async()=>{
  const {createPlayer,xyMovement}=await import('../src/physics/DoomMovement');
  const {dividedMap}=await import('./fixtures/maps');
  const player=createPlayer(80,0,0),map=dividedMap(),before=player.mo.x;
  player.mo.momx=-10001;player.mo.momy=20*65536;
  xyMovement(player.mo,map,true);
  assert.equal(player.mo.x,before-10001);
  assert.equal(player.mo.y,20*65536);
});

test('P_MobjThinker retains the collision floor while an actor straddles a descending step',async()=>{
  const {Group}=await import('three/webgpu');
  const {initMobjSystem,spawnMobj,allMobjs}=await import('../src/game/Mobj');
  const {tryMove}=await import('../src/physics/DoomMovement');
  const {resetThinkers,runThinkers}=await import('../src/game/Thinkers');
  const {dividedMap}=await import('./fixtures/maps');
  resetThinkers();allMobjs.length=0;const map=dividedMap();map.sectors[1].floorHeight=-16;
  initMobjSystem({},new Group(),map);const actor=spawnMobj(50*65536,0,0,'MT_POSSESSED');
  actor.tics=10;
  assert(tryMove(actor,-10*65536,0,map));assert.equal(actor.floorz,0);
  runThinkers();assert.equal(actor.floorz,0);assert.equal(actor.z,0);assert.equal(actor.momz,0);
  resetThinkers();allMobjs.length=0;
});

test('diagonal wall contact rounds side products before choosing the slide fallback',async()=>{
  const {createPlayer,xyMovement}=await import('../src/physics/DoomMovement');
  const {dividedMap}=await import('./fixtures/maps');
  // Reduced from E3M5/DEMO3 tic 2785. Original P_XYMovement keeps X and
  // accepts the Y-only fallback. Floating side tests incorrectly slide both.
  const map=dividedMap();map.nodes=[];map.subsectors=[{firstSeg:0,numSegs:1}];
  map.vertexes=[{x:-448,y:384},{x:-704,y:448}];map.linedefs=[{...map.linedefs[0],left:-1,flags:1}];
  map.blockmap={originX:-1024,originY:0,columns:8,rows:8,blockSize:128,lists:Array.from({length:64},()=>[0])};
  const player=createPlayer(0,0,0);Object.assign(player.mo,{x:-40654136,y:29300249,momx:-22616,momy:4868});
  xyMovement(player.mo,map,true);
  assert.deepEqual([player.mo.x,player.mo.y,player.mo.momx,player.mo.momy],[-40654136,29305117,-20496,4411]);
});
