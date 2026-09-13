import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {initMobjSystem,spawnMobj,allMobjs} from '../src/game/Mobj';
import {P_CheckSight,divlineSide} from '../src/game/Sight';
import {resetThinkers} from '../src/game/Thinkers';
import {dividedMap} from './fixtures/maps';
const F=65536;
test('P_CheckSight preserves large fixed products when narrowing a raised-floor opening',()=>{
  const map=dividedMap();resetThinkers();allMobjs.length=0;initMobjSystem({},new Group(),map);
  const source=spawnMobj(80*F,F,0,'MT_SHADOWS'),target=spawnMobj(-80*F,F,48*F,'MT_PLAYER');
  // Offset from y=0 so this fixture isolates slopes, not the horizontal source quirk.
  map.sectors[1].floorHeight=48;
  assert.equal(P_CheckSight(source,target,map),true);
  map.sectors[1].ceilingHeight=48;
  assert.equal(P_CheckSight(source,target,map),false);
  resetThinkers();allMobjs.length=0;
});

test('P_CheckSight uses the map REJECT sector-pair bitmap by default',()=>{
  const map=dividedMap();resetThinkers();allMobjs.length=0;initMobjSystem({},new Group(),map);
  const source=spawnMobj(80*F,0,0,'MT_TROOP'),target=spawnMobj(-80*F,0,0,'MT_PLAYER');
  assert.equal(P_CheckSight(source,target,map),true);
  map.reject=new Uint8Array([1<<(source.sectorIndex*map.sectors.length+target.sectorIndex)]);
  assert.equal(P_CheckSight(source,target,map),false);
  assert.equal(P_CheckSight(source,target,map,new Uint8Array([0])),true);
  resetThinkers();allMobjs.length=0;
});

test('P_DivlineSide preserves the original horizontal boundary quirk',()=>{
  const line={x:0,y:64*F,dx:128*F,dy:0};
  assert.equal(divlineSide(64*F,90*F,line),2);
  assert.equal(divlineSide(32*F,64*F,line),0);
  assert.equal(divlineSide(32*F,90*F,line),1);
});
