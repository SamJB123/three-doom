import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group } from 'three/webgpu';
import { createWorld } from 'koota';
import { Input, PlayerStatus } from '../src/ecs/traits.ts';
import { fixedMul, fixedDiv, FRACUNIT as F } from '../src/math/fixed.ts';
import { createPlayer } from '../src/physics/DoomMovement.ts';
import { dividedMap } from './fixtures/maps.ts';
import { allMobjs, initMobjSystem, spawnMapThing, spawnMobj } from '../src/game/Mobj.ts';
import { MF_AMBUSH } from '../src/game/MobjData.ts';
import { gameRules, shouldSpawnThing } from '../src/game/GameRules.ts';
import { resetThinkers } from '../src/game/Thinkers.ts';
import { WeaponSystem } from '../src/game/Weapons.ts';
import { aimLineAttack, setAttackMap } from '../src/game/Attack.ts';
import { A_Look, clearSoundTargets, P_NoiseAlert, setPlayerMobj } from '../src/game/EnemyAI.ts';

test('fixed arithmetic matches executed original C reference vectors', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/fixed-reference.json',import.meta.url),'utf8'));
  for (const v of fixture.vectors) {
    assert.equal(fixedMul(v.a,v.b),v.mul,`mul ${v.a},${v.b}`);
    assert.equal(fixedDiv(v.a,v.b),v.div,`div ${v.a},${v.b}`);
  }
});

test('thing flags select difficulty and exclude multiplayer objects', () => {
  for (const skill of [1,2,3,4,5] as const) {
    const bit=skill<=2 ? 1 : skill===3 ? 2 : 4;
    for (const flags of [1,2,4,7,15,23]) {
      assert.equal(shouldSpawnThing({type:3004,x:0,y:0,angle:0,flags},skill),!(flags&16) && !!(flags&bit));
    }
  }
});

test('map spawning preserves angle, ambush flag, sector and spawn tic range', () => {
  resetThinkers(); allMobjs.length=0; gameRules.skill=3;
  const map=dividedMap(); initMobjSystem({},new Group(),map);
  const mo=spawnMapThing({type:3004,x:50,y:0,angle:90,flags:15})!;
  assert.equal(mo.angle,Math.PI/2); assert(mo.flags&MF_AMBUSH);
  assert.equal(mo.sectorIndex,0); assert(mo.tics>0 && mo.tics<=10);
  assert.equal(spawnMapThing({type:3004,x:50,y:0,angle:0,flags:23}),null);
  resetThinkers(); allMobjs.length=0;
});

test('fist/chainsaw attacks supply melee ranges rather than bullet range', () => {
  for (const [weapon,range] of [['fist',64],['chainsaw',65]] as const) {
    const world=createWorld(Input,PlayerStatus), state=world.get(PlayerStatus)!;
    state.currentWeapon=weapon; state.weapons[weapon]=true;
    const weapons=new WeaponSystem(), ranges:number[]=[];
    weapons.setFireCallback((_a,_s,_d,r)=>ranges.push(r)); weapons.setup(state);
    world.set(Input,{attack:true});
    for (let i=0;i<100;i++) weapons.tick(world);
    assert(ranges.length>0); assert(ranges.every(r=>r===range*F)); world.destroy();
  }
});

test('autoaim finds elevated target but does not aim through a solid wall', () => {
  resetThinkers(); allMobjs.length=0;
  const map=dividedMap(); initMobjSystem({},new Group(),map); setAttackMap(map);
  const player=createPlayer(60,0,0).mo;
  const target=spawnMobj(-60*F,0,48*F,'MT_POSSESSED');
  const aim=aimLineAttack(player,Math.PI,2048*F);
  assert.equal(aim.target,target); assert(aim.slope>0);
  map.linedefs[0].left=-1;
  assert.equal(aimLineAttack(player,Math.PI,2048*F).target,null);
  resetThinkers(); allMobjs.length=0;
});

test('weapon noise wakes an enemy facing away; closed doors block sound', () => {
  resetThinkers(); allMobjs.length=0; clearSoundTargets();
  const map=dividedMap(); initMobjSystem({},new Group(),map);
  const player=createPlayer(100,0,0).mo; setPlayerMobj(player);
  const enemy=spawnMobj(-100*F,0,0,'MT_POSSESSED'); enemy.angle=Math.PI;
  A_Look(enemy,map); assert.equal(enemy.target,null);
  P_NoiseAlert(player,player,map); A_Look(enemy,map); assert.equal(enemy.target,player);
  clearSoundTargets(); enemy.target=null; map.sectors[1].ceilingHeight=0;
  P_NoiseAlert(player,player,map); A_Look(enemy,map); assert.equal(enemy.target,null);
  resetThinkers(); allMobjs.length=0; clearSoundTargets();
});

test('BFG explosion spray damages from shooter origin and respects blocking walls',async()=>{
  const {initAttackSystem}=await import('../src/game/Attack');
  const {setMobjState}=await import('../src/game/Mobj');
  resetThinkers();allMobjs.length=0;
  const map=dividedMap();initMobjSystem({},new Group(),map);setAttackMap(map);initAttackSystem();
  const player=createPlayer(60,0,0).mo;
  const enemy=spawnMobj(-60*F,0,0,'MT_CYBORG');
  const missile=spawnMobj(900*F,900*F,0,'MT_BFG');missile.target=player;missile.angle=Math.PI;
  map.linedefs[0].left=-1;
  setMobjState(missile,'S_BFGLAND3');assert.equal(enemy.health,4000);
  map.linedefs[0].left=1;
  setMobjState(missile,'S_BFGLAND3');assert(enemy.health<4000);
  assert(allMobjs.some(m=>m.type==='MT_EXTRABFG'));
  resetThinkers();allMobjs.length=0;
});

test('teleport uses back subsector, telefrags, updates height and spawns two fogs',async()=>{
  const {evTeleport,consumeTeleport}=await import('../src/game/Teleport');
  resetThinkers();allMobjs.length=0;gameRules.skill=3;
  const map=dividedMap();map.sectors[1].tag=7;map.sectors[1].floorHeight=32;map.sectors[1].ceilingHeight=96;
  initMobjSystem({},new Group(),map);setAttackMap(map);
  const player=createPlayer(60,0,0), enemy=spawnMobj(-60*F,0,32*F,'MT_POSSESSED');
  const thing={type:14,x:-60,y:0,angle:90,flags:7};
  const line={...map.linedefs[0],tag:7};
  assert.equal(evTeleport(line,1,player,map,[thing]),false);
  assert.equal(evTeleport(line,0,player,map,[thing]),true);
  assert(enemy.health<=0);assert.equal(player.mo.x,-60*F);assert.equal(player.mo.z,32*F);
  assert.equal(player.mo.ceilingz,96*F);assert.equal(player.mo.sectorIndex,1);assert.equal(player.mo.reactionTime,18);
  assert.equal(allMobjs.filter(m=>m.type==='MT_TFOG').length,2);
  assert.deepEqual(consumeTeleport(),{angle:90,reactionTime:18});assert.equal(consumeTeleport(),null);
  resetThinkers();allMobjs.length=0;
});

test('episode boss exits require last matching boss and living player',async()=>{
  const {A_BossDeath}=await import('../src/game/EnemyAI');
  const {setExitCallback}=await import('../src/game/UseAction');
  let exits=0;setExitCallback(()=>exits++);
  for(const [episode,type] of [[2,'MT_CYBORG'],[3,'MT_SPIDER']] as const) {
    resetThinkers();allMobjs.length=0;Object.assign(gameRules,{episode,map:8,skill:3});
    initMobjSystem({},new Group(),dividedMap());
    const player=createPlayer(60,0,0).mo;setPlayerMobj(player);
    const a=spawnMobj(-60*F,0,0,type),b=spawnMobj(-100*F,0,0,type);
    a.health=0;const before=exits;A_BossDeath(a);assert.equal(exits,before);
    b.health=0;player.health=0;A_BossDeath(b);assert.equal(exits,before);
    player.health=100;A_BossDeath(b);assert.equal(exits,before+1);
  }
  setExitCallback(()=>{});resetThinkers();allMobjs.length=0;Object.assign(gameRules,{episode:1,map:1,skill:3});
});

test('P_Move advances every Ultimate Doom monster in map units, not 1/65536 units',async()=>{
  const {P_Move}=await import('../src/game/EnemyAI');
  const xs=[F,47000,0,-47000,-F,-47000,0,47000],ys=[0,47000,F,47000,0,-47000,-F,-47000];
  for(const type of ['MT_POSSESSED','MT_SHOTGUY','MT_TROOP','MT_SERGEANT','MT_SHADOWS','MT_HEAD','MT_BRUISER','MT_SKULL','MT_CYBORG','MT_SPIDER']) {
    for(let dir=0;dir<8;dir++) {
      resetThinkers();allMobjs.length=0;
      const map=dividedMap();initMobjSystem({},new Group(),map);
      const mo=spawnMobj(100*F,0,0,type);mo.moveDir=dir;
      assert.equal(P_Move(mo,map),true,type);
      assert.equal(mo.x,100*F+mo.info.speed*xs[dir],type);
      assert.equal(mo.y,mo.info.speed*ys[dir],type);
    }
  }
  resetThinkers();allMobjs.length=0;
});

test('vanilla actor collision blocks walking beneath an elevated lost soul',async()=>{
  const {tryMove}=await import('../src/physics/DoomMovement');
  resetThinkers();allMobjs.length=0;
  const map=dividedMap();map.sectors[0].ceilingHeight=512;initMobjSystem({},new Group(),map);
  const player=createPlayer(100,0,0);
  const skull=spawnMobj(150*F,0,256*F,'MT_SKULL');
  assert(skull.z>player.mo.z+player.mo.height);
  assert.equal(tryMove(player.mo,150*F,0,map),false);
  assert.equal(tryMove(player.mo,100*F,60*F,map),true);
  resetThinkers();allMobjs.length=0;
});

test('floating chase adjusts height at tall steps but cannot float through walls',async()=>{
  const {P_Move}=await import('../src/game/EnemyAI');
  const {MF_INFLOAT}=await import('../src/game/MobjData');
  resetThinkers();allMobjs.length=0;
  const map=dividedMap();map.sectors[1].floorHeight=48;map.sectors[1].ceilingHeight=160;
  initMobjSystem({},new Group(),map);
  const skull=spawnMobj(20*F,0,0,'MT_SKULL');skull.moveDir=4;
  assert.equal(P_Move(skull,map),true);assert.equal(skull.x,20*F);assert.equal(skull.z,4*F);assert(skull.flags&MF_INFLOAT);
  map.linedefs[0].left=-1;
  assert.equal(P_Move(skull,map),false);assert.equal(skull.z,4*F);
  resetThinkers();allMobjs.length=0;
});

test('manual weapon selection accepts owned empty weapons and explicit wheel slots',()=>{
  for(const [slot,weapon] of [[3,'shotgun'],[8,'chainsaw'],[9,'supershotgun']] as const){
    const world=createWorld(Input,PlayerStatus),state=world.get(PlayerStatus)!;
    const weapons=new WeaponSystem();weapons.setup(state);state.weapons[weapon]=true;state.ammo.shell=0;
    world.set(Input,{weaponSelect:slot});weapons.tick(world);world.set(Input,{weaponSelect:-1});
    for(let i=0;i<80;i++)weapons.tick(world);
    assert.equal(state.currentWeapon,weapon);world.destroy();
  }
});
