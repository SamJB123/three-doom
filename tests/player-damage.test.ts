import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {createPlayerStatus} from '../src/ecs/traits';
import {damagePlayer} from '../src/game/PlayerDamage';
import {gameRules} from '../src/game/GameRules';
import {allMobjs,initMobjSystem,spawnMobj} from '../src/game/Mobj';
import {radiusAttack,setAttackMap,setPlayerDamageMobjCallback} from '../src/game/Attack';
import {resetThinkers} from '../src/game/Thinkers';
import {dividedMap} from './fixtures/maps';
const F=65536;
test('player damage applies armor, cheat threshold and hell-exit survival in source order',()=>{
  gameRules.skill=3;
  let state=createPlayerStatus();state.godMode=true;damagePlayer(state,999);assert.equal(state.health,100);
  damagePlayer(state,1000);assert.equal(state.health,0);assert.equal(state.playerState,'PST_DEAD');assert.equal(state.mobjState.name,'S_PLAY_XDIE1');
  state=createPlayerStatus();state.powers.invulnerability=100;damagePlayer(state,10000);assert.equal(state.health,0);
  state=createPlayerStatus();state.health=10;damagePlayer(state,20,11);assert.equal(state.health,1);assert.equal(state.playerState,'PST_LIVE');
  state=createPlayerStatus();state.armor=4;state.armorType=1;damagePlayer(state,15);assert.equal(state.health,89);assert.equal(state.armor,0);assert.equal(state.armorType,0);
  state=createPlayerStatus();gameRules.skill=1;damagePlayer(state,9);assert.equal(state.health,96);gameRules.skill=3;
});
test('radius damage reaches the player once through sight tracing and excludes both boss types',()=>{
  resetThinkers();allMobjs.length=0;
  const map=dividedMap();initMobjSystem({},new Group(),map);setAttackMap(map);
  const player=spawnMobj(40*F,0,0,'MT_PLAYER'),spot=spawnMobj(-40*F,0,0,'MT_ROCKET');
  const cyborg=spawnMobj(-40*F,0,0,'MT_CYBORG'),spider=spawnMobj(-40*F,0,0,'MT_SPIDER');
  const seen:number[]=[];setPlayerDamageMobjCallback(damage=>seen.push(damage));
  radiusAttack(spot,null,128);assert.deepEqual(seen,[64]);assert.equal(cyborg.health,4000);assert.equal(spider.health,3000);
  map.sectors[1].ceilingHeight=0;radiusAttack(spot,null,128);assert.deepEqual(seen,[64]);
  assert.equal(player.health,100);resetThinkers();allMobjs.length=0;
});
test('player corpse clears collision, keeps overkill health and ticks canonical death states',async()=>{
  const {tickPlayerMobjState}=await import('../src/game/PlayerState');
  const {MF_SOLID,MF_SHOOTABLE,MF_CORPSE}=await import('../src/game/MobjData');
  resetThinkers();allMobjs.length=0;initMobjSystem({},new Group(),dividedMap());
  const player=spawnMobj(40*F,0,0,'MT_PLAYER'),state=createPlayerStatus();
  damagePlayer(state,250,0,player);
  assert.equal(state.health,0);assert.equal(player.health,-150);assert.equal(player.height,14*F);
  assert.equal(player.flags&(MF_SOLID|MF_SHOOTABLE),0);assert(player.flags&MF_CORPSE);
  assert.equal(player.state,'S_PLAY_XDIE1');assert.equal(player.tics,state.mobjState.tics);
  for(let i=0;i<50;i++)tickPlayerMobjState(state,player);
  assert.equal(player.state,'S_PLAY_XDIE9');assert.equal(player.tics,-1);
  resetThinkers();allMobjs.length=0;
});
test('player health, armor and exit protection match executed P_DamageMobj C fixtures',async()=>{
  const {readFileSync}=await import('node:fs');
  const {restoreRandom}=await import('../src/game/DoomRandom');
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/damage-reference.json',import.meta.url),'utf8'));
  for(const {input,expected} of fixture.cases){
    resetThinkers();allMobjs.length=0;initMobjSystem({},new Group(),dividedMap());
    const actor=spawnMobj(40*F,0,0,'MT_PLAYER'),state=createPlayerStatus();
    state.health=actor.health=input.health;state.armor=input.armor??0;state.armorType=input.armorType??0;
    state.godMode=!!input.god;state.powers.invulnerability=input.invuln?1:0;gameRules.skill=input.skill??3;
    restoreRandom({play:255,misc:0});damagePlayer(state,input.damage,input.sector??0,actor);
    assert.deepEqual({health:state.health,actorHealth:actor.health,armor:state.armor,armorType:state.armorType,damageCount:state.damageCount,killed:state.playerState==='PST_DEAD'?1:0},
      {health:expected.health,actorHealth:expected.actorHealth,armor:expected.armor,armorType:expected.armorType,damageCount:expected.damageCount,killed:expected.killed},JSON.stringify(input));
  }
  resetThinkers();allMobjs.length=0;gameRules.skill=3;
});
