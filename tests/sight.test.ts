import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {initMobjSystem,spawnMobj,allMobjs} from '../src/game/Mobj';
import {P_CheckSight} from '../src/game/Sight';
import {resetThinkers} from '../src/game/Thinkers';
import {dividedMap} from './fixtures/maps';
const F=65536;
test('P_CheckSight preserves large fixed products when narrowing a raised-floor opening',()=>{
  const map=dividedMap();resetThinkers();allMobjs.length=0;initMobjSystem({},new Group(),map);
  const source=spawnMobj(80*F,0,0,'MT_SHADOWS'),target=spawnMobj(-80*F,0,48*F,'MT_PLAYER');
  map.sectors[1].floorHeight=48;
  assert.equal(P_CheckSight(source,target,map),true);
  map.sectors[1].ceilingHeight=48;
  assert.equal(P_CheckSight(source,target,map),false);
  resetThinkers();allMobjs.length=0;
});
