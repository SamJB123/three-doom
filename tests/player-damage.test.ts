import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {createPlayerStatus} from '../src/ecs/traits';
import {damagePlayer,playerInSpecialSector} from '../src/game/PlayerDamage';
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
  const player=spawnMobj(40*F,F,0,'MT_PLAYER'),spot=spawnMobj(-40*F,F,0,'MT_ROCKET');
  const cyborg=spawnMobj(-40*F,0,0,'MT_CYBORG'),spider=spawnMobj(-40*F,0,0,'MT_SPIDER');
  const seen:number[]=[];setPlayerDamageMobjCallback(damage=>{seen.push(damage);});
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

test('P_DamageMobj player pain sets JUSTHIT only when the pain roll succeeds',async()=>{
  const {playerPainCheck}=await import('../src/game/PlayerState');
  const {restoreRandom}=await import('../src/game/DoomRandom');
  const {MF_JUSTHIT}=await import('../src/game/MobjData');
  for(const [seed,pain] of [[0,true],[157,false]] as const){
    resetThinkers();allMobjs.length=0;initMobjSystem({},new Group(),dividedMap());
    const actor=spawnMobj(40*F,0,0,'MT_PLAYER'),state=createPlayerStatus();
    restoreRandom({play:seed,misc:0});playerPainCheck(state,actor);
    assert.equal(!!(actor.flags&MF_JUSTHIT),pain);assert.equal(state.mobjState.name,pain?'S_PLAY_PAIN':'S_PLAY');
  }
  resetThinkers();allMobjs.length=0;
});

test('living player damage wakes and records a target, respecting immunity, death and target threshold',async()=>{
  const {damageMobj}=await import('../src/game/Attack');
  for(const mode of ['normal','immune','dead','threshold','self','vile']){
    resetThinkers();allMobjs.length=0;initMobjSystem({},new Group(),dividedMap());
    const actor=spawnMobj(40*F,0,0,'MT_PLAYER'),source=spawnMobj(-40*F,0,0,mode==='vile'?'MT_VILE':'MT_POSSESSED');
    const state=createPlayerStatus();state.godMode=mode==='immune';actor.reactionTime=7;
    if(mode==='threshold')actor.threshold=20;
    setPlayerDamageMobjCallback((damage,_inflictor,source)=>damagePlayer(state,damage,0,actor,source));
    damageMobj(actor,null,mode==='self'?actor:source,mode==='dead'?200:1);
    assert.equal(actor.reactionTime,mode==='immune'||mode==='dead'?7:0,mode);
    assert.equal(actor.target,mode==='normal'?source:null,mode);
    assert.equal(actor.threshold,mode==='normal'?100:mode==='threshold'?20:0,mode);
  }
  resetThinkers();allMobjs.length=0;
});

test('a skipped player pain roll still synchronizes the wake state with the actor',async()=>{
  const {restoreRandom}=await import('../src/game/DoomRandom');
  resetThinkers();allMobjs.length=0;initMobjSystem({},new Group(),dividedMap());
  const actor=spawnMobj(40*F,0,0,'MT_PLAYER'),source=spawnMobj(-40*F,0,0,'MT_POSSESSED'),state=createPlayerStatus();
  restoreRandom({play:157,misc:0});damagePlayer(state,1,0,actor,source);
  assert.equal(actor.state,'S_PLAY_RUN1');assert.equal(state.mobjState.name,actor.state);assert.equal(state.mobjState.tics,actor.tics);
  resetThinkers();allMobjs.length=0;
});

test('P_PlayerInSpecialSector requires contact with the centre sector floor',async()=>{
  const {createPlayer}=await import('../src/physics/DoomMovement');
  const map=dividedMap();map.sectors[0].floorHeight=8;map.sectors[1].special=16;
  const player=createPlayer(-1,0,0),state=createPlayerStatus();gameRules.skill=3;
  player.mo.z=player.mo.floorz=8*F;
  playerInSpecialSector(player,state,map,416);assert.equal(state.health,100);
  player.mo.z=player.mo.floorz=0;
  playerInSpecialSector(player,state,map,417);assert.equal(state.health,100);
  playerInSpecialSector(player,state,map,416);assert.equal(state.health,80);
});
