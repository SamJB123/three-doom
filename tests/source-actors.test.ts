import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {MOBJ_STATES,MOBJ_TYPES,DOOMEDNUM_TO_TYPE,MF_SOLID,MF_SPECIAL,MF_NOSECTOR} from '../src/game/MobjData';
import {spawnMapThing,initMobjSystem,allMobjs} from '../src/game/Mobj';
import {resetThinkers} from '../src/game/Thinkers';
import {dividedMap} from './fixtures/maps';
import {createPlayer,checkPosition} from '../src/physics/DoomMovement';
import {migrateLegacyMapActors} from '../src/game/LegacySave';
import {archiveRandom} from '../src/game/DoomRandom';
import {FRACUNIT as F} from '../src/math/fixed';

test('source actor/state tables have complete references and original pickup/decorative flags',()=>{
  assert.equal(Object.keys(MOBJ_STATES).length,967);assert.equal(Object.keys(MOBJ_TYPES).length,137);
  for(const state of Object.values(MOBJ_STATES))assert(MOBJ_STATES[state.next],state.next);
  for(const info of Object.values(MOBJ_TYPES))for(const field of ['spawnState','seeState','painState','meleeState','missileState','deathState','xDeathState','raiseState'] as const)if(info[field])assert(MOBJ_STATES[info[field]!],info[field]!);
  assert(MOBJ_TYPES[DOOMEDNUM_TO_TYPE[2014]].flags&MF_SPECIAL);
  assert(MOBJ_TYPES[DOOMEDNUM_TO_TYPE[30]].flags&MF_SOLID);
  assert.equal(MOBJ_STATES.S_POSS_ATK2.bright,false);
});

test('pillars block movement and hanging bodies use source ceiling placement/solidity',()=>{
  resetThinkers();allMobjs.length=0;const map=dividedMap();initMobjSystem({},new Group(),map);
  const pillar=spawnMapThing({type:30,x:50,y:0,angle:0,flags:7})!;
  const player=createPlayer(90,0,0);assert.equal(checkPosition(player.mo,60*F,0,map),false);
  pillar.removed=true;
  const body=spawnMapThing({type:49,x:50,y:0,angle:0,flags:7})!;
  assert.equal(body.z,(128-68)*F);assert(body.flags&MF_SOLID);
  body.removed=true;
  const nonblocking=spawnMapThing({type:59,x:50,y:0,angle:0,flags:7})!;
  assert(!(nonblocking.flags&MF_SOLID));assert.equal(nonblocking.z,(128-84)*F);
  assert.equal(checkPosition(player.mo,60*F,0,map),true);
});

test('legacy save migration preserves surviving static items and leaves collected items absent',()=>{
  resetThinkers();allMobjs.length=0;initMobjSystem({},new Group(),dividedMap());
  const things=[2014,2001,30,14].map((type,i)=>({type,x:50+i*5,y:0,angle:0,flags:7}));
  const random=archiveRandom();
  migrateLegacyMapActors({sprites:[{index:1,frame:0,tics:0},{index:2,frame:0,tics:0}]},things);
  assert.deepEqual(allMobjs.map(m=>m.info.doomedNum),[2001,30,14]);
  assert(allMobjs[2].flags&MF_NOSECTOR);assert.equal(allMobjs[2].mesh,null);
  assert.deepEqual(archiveRandom(),random);
});
