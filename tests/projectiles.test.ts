import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {FRACUNIT as F} from '../src/math/fixed';
import {dividedMap} from './fixtures/maps';
import {allMobjs,initMobjSystem,spawnMobj,spawnMissile} from '../src/game/Mobj';
import {setAttackMap,initAttackSystem} from '../src/game/Attack';
import {resetThinkers,runThinkers} from '../src/game/Thinkers';
import {MF_MISSILE,MF_SOLID,MF_SKULLFLY} from '../src/game/MobjData';
function setup(){resetThinkers();allMobjs.length=0;const map=dividedMap();initMobjSystem({},new Group(),map);setAttackMap(map);initAttackSystem();}
function fire(targetType:string,flags?:number,z=0){
  setup();const source=spawnMobj(80*F,0,0,'MT_TROOP'),target=spawnMobj(40*F,0,z,targetType);
  if(flags!==undefined)target.flags=flags;
  const shot=spawnMobj(60*F,0,32*F,'MT_TROOPSHOT');shot.target=source;shot.momx=-8*F;
  const health=target.health;runThinkers();return {shot,target,health};
}
test('missiles explode without direct damage on their own species, but damage other species',()=>{
  let result=fire('MT_TROOP');assert(!(result.shot.flags&MF_MISSILE));assert.equal(result.target.health,result.health);
  result=fire('MT_SERGEANT');assert(!(result.shot.flags&MF_MISSILE));assert(result.target.health<result.health);
});
test('missiles stop on solid unshootable actors and pass over vertically separated actors',()=>{
  let result=fire('MT_TROOP',MF_SOLID);assert(!(result.shot.flags&MF_MISSILE));assert.equal(result.shot.x,60*F);
  result=fire('MT_TROOP',MF_SOLID,96*F);assert(result.shot.flags&MF_MISSILE);assert.equal(result.shot.x,52*F);
});
test('initial half-step catches actor impacts; charging skulls use original infinite-height contact',()=>{
  setup();const source=spawnMobj(60*F,0,0,'MT_TROOP'),target=spawnMobj(45*F,0,0,'MT_TROOP');
  const shot=spawnMissile(source,target,'MT_TROOPSHOT');assert(!(shot.flags&MF_MISSILE));assert.equal(target.health,target.info.spawnHealth);
  setup();const obstacle=spawnMobj(40*F,0,0,'MT_TROOP');obstacle.flags=MF_SOLID;
  const skull=spawnMobj(65*F,0,96*F,'MT_SKULL');skull.flags|=MF_SKULLFLY;skull.momx=-8*F;
  runThinkers();assert(!(skull.flags&MF_SKULLFLY));assert.equal(skull.momx,0);assert.equal(skull.x,65*F);
});
test('charging skull blocked by a wall keeps zero momentum and exits charge next tic',()=>{
  setup();const map=dividedMap();map.linedefs[0].left=-1;initMobjSystem({},new Group(),map);
  const skull=spawnMobj(20*F,0,32*F,'MT_SKULL');skull.flags|=MF_SKULLFLY;skull.momx=-8*F;
  runThinkers();assert.equal(skull.momx,0);assert.equal(skull.x,20*F);
  runThinkers();assert(!(skull.flags&MF_SKULLFLY));
});
