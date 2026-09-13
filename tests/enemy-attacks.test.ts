import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {A_Chase,A_PosAttack,A_SPosAttack,A_CPosAttack} from '../src/game/EnemyAI';
import {allMobjs,initMobjSystem,spawnMobj} from '../src/game/Mobj';
import {setAttackMap} from '../src/game/Attack';
import {resetThinkers} from '../src/game/Thinkers';
import {archiveRandom,restoreRandom} from '../src/game/DoomRandom';
import {gameRules} from '../src/game/GameRules';
import {MF_JUSTATTACKED,MF_JUSTHIT} from '../src/game/MobjData';
import {dividedMap} from './fixtures/maps';
const F=65536;
function setup(type='MT_TROOP'){
  resetThinkers();allMobjs.length=0;const map=dividedMap();initMobjSystem({},new Group(),map);setAttackMap(map);
  const actor=spawnMobj(40*F,0,0,type),target=spawnMobj(-80*F,0,64*F,'MT_BRUISER');actor.target=target;
  return {map,actor,target};
}
test('hitscan monsters aim vertically before applying their horizontal spread',()=>{
  for(const [type,attack] of [['MT_POSSESSED',A_PosAttack],['MT_SHOTGUY',A_SPosAttack],['MT_CHAINGUY',A_CPosAttack],['MT_SPIDER',A_SPosAttack]] as const){
    const {actor,target}=setup(type);restoreRandom({play:2,misc:0});const health=target.health;
    attack(actor);assert(target.health<health,type);
  }
  resetThinkers();allMobjs.length=0;
});
test('A_Chase turns one octant and Nightmare skips the post-attack walk without consuming RNG',()=>{
  const {map,actor}=setup();gameRules.skill=5;actor.angle=0;actor.moveDir=4;actor.movecount=5;actor.flags|=MF_JUSTATTACKED;
  restoreRandom({play:0,misc:0});A_Chase(actor,map);
  assert.equal(actor.angle,Math.PI/4);assert.equal(actor.movecount,5);assert.equal(actor.x,40*F);assert.equal(archiveRandom().play,0);
  assert.equal(actor.flags&MF_JUSTATTACKED,0);gameRules.skill=3;
});
test('Nightmare attacks while walking, while normal skills require exactly zero movecount',()=>{
  for(const [skill,count,attack] of [[3,5,false],[3,-1,false],[3,0,true],[5,5,true]] as const){
    const {map,actor}=setup();gameRules.skill=skill;actor.reactionTime=0;actor.movecount=count;actor.moveDir=0;actor.flags|=MF_JUSTHIT;
    A_Chase(actor,map);assert.equal(actor.state===actor.info.missileState,attack,`${skill}/${count}`);
  }
  gameRules.skill=3;resetThinkers();allMobjs.length=0;
});
test('monster death voice variants consume the source gameplay random draw even without audio',async()=>{
  const {A_Scream}=await import('../src/game/EnemyAI');
  for(const [type,draws] of [['MT_POSSESSED',1],['MT_TROOP',1],['MT_CYBORG',0],['MT_SPIDER',0]] as const){
    const {actor}=setup(type);restoreRandom({play:0,misc:0});A_Scream(actor);assert.equal(archiveRandom().play,draws,type);
  }
  resetThinkers();allMobjs.length=0;
});
test('P_SpawnMobj starts with east movedir, so the first chase rotates a south-facing monster southeast',()=>{
  const {map,actor}=setup('MT_SHADOWS');
  assert.equal(actor.moveDir,0);actor.angle=3*Math.PI/2;
  gameRules.skill=5;actor.flags|=MF_JUSTATTACKED;
  A_Chase(actor,map);assert.equal(actor.angle,7*Math.PI/4);
  gameRules.skill=3;resetThinkers();allMobjs.length=0;
});

test('P_LookForPlayers respects the initial lastlook stop before checking player zero',async()=>{
  const {A_Look,setPlayerMobj}=await import('../src/game/EnemyAI');
  const {map,actor,target}=setup();setPlayerMobj(target);actor.target=null;actor.angle=Math.PI;actor.lastLook=1;
  A_Look(actor,map);assert.equal(actor.target,null);assert.equal(actor.lastLook,0);
  A_Look(actor,map);assert.equal(actor.target,target);
  resetThinkers();allMobjs.length=0;
});

test('A_FaceTarget uses the source shift-21 shadow spread and exactly two draws',async()=>{
  const {A_FaceTarget}=await import('../src/game/EnemyAI');const {MF_SHADOW}=await import('../src/game/MobjData');
  const {pointToRadians,radiansToAngle}=await import('../src/math/angles');
  const {actor,target}=setup();target.flags|=MF_SHADOW;restoreRandom({play:0,misc:0});
  const base=radiansToAngle(pointToRadians(target.x-actor.x,target.y-actor.y));A_FaceTarget(actor);
  assert.equal(radiansToAngle(actor.angle),(base+((8-109)<<21))>>>0);assert.equal(archiveRandom().play,2);
  target.flags&=~MF_SHADOW;A_FaceTarget(actor);assert.equal(radiansToAngle(actor.angle),base);assert.equal(archiveRandom().play,2);
  resetThinkers();allMobjs.length=0;
});

test('A_BruisAttack preserves the preceding facing state while its missile aims independently',async()=>{
  const {A_BruisAttack}=await import('../src/game/EnemyAI');const {MF_SHADOW}=await import('../src/game/MobjData');
  for(const shadow of [false,true]){
    const {actor,target}=setup('MT_BRUISER');actor.angle=0.3;if(shadow)target.flags|=MF_SHADOW;
    restoreRandom({play:0,misc:0});A_BruisAttack(actor);
    assert.equal(actor.angle,0.3);assert.equal(archiveRandom().play,shadow?4:2);
    const missile=allMobjs.find(m=>m.type==='MT_BRUISERSHOT')!;assert(missile.momx<0);
  }
  resetThinkers();allMobjs.length=0;
});
