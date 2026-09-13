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

test('player missiles autoaim up/down and search side angles before falling back horizontally',async()=>{
  const {spawnPlayerMissile}=await import('../src/game/Mobj');
  const {createPlayer}=await import('../src/physics/DoomMovement');
  for(const y of [0,6,-6])for(const z of [0,48]){
    setup();const map=dividedMap(),player=createPlayer(50,0,0,map);
    const target=spawnMobj(110*F,y*F,z*F,'MT_TROOP');target.radius=F;
    const missile=spawnPlayerMissile(player,0,'MT_ROCKET')!;
    assert.equal(missile.target,player.mo);assert(z===0?missile.momz<0:missile.momz>0);
    assert.equal(missile.angle,y===0?0:y>0?Math.PI/32:-Math.PI/32);
  }
  setup();const map=dividedMap(),player=createPlayer(50,0,0,map);
  assert.equal(spawnPlayerMissile(player,.3,'MT_PLASMA')!.momz,0);
  setup();map.linedefs[0].left=-1;initMobjSystem({},new Group(),map);setAttackMap(map);
  spawnMobj(-60*F,0,48*F,'MT_TROOP');
  assert.equal(spawnPlayerMissile(player,Math.PI,'MT_ROCKET')!.momz,0);
});

test('ceiling-limiting sky wall removes missile while ordinary wall explodes it',()=>{
  for(const sky of [true,false]){
    setup();const map=dividedMap();map.sectors[1].ceilingHeight=32;
    map.sectors[1].ceilingTex=sky?'F_SKY1':'CEIL1_1';
    initMobjSystem({},new Group(),map);setAttackMap(map);
    const shot=spawnMobj(10*F,0,64*F,'MT_TROOPSHOT');shot.momx=-8*F;
    runThinkers();assert.equal(shot.removed,sky);
    if(!sky)assert(!(shot.flags&MF_MISSILE));
  }
});

test('player missile aim probes and vertical launch momentum match executed original C',async()=>{
  const {readFileSync}=await import('node:fs');
  const {spawnPlayerMissile,setMissileAimCallback}=await import('../src/game/Mobj');
  const {createPlayer}=await import('../src/physics/DoomMovement');
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/missile-reference.json',import.meta.url),'utf8'));
  for(const expected of fixture.cases){
    setup();const player=createPlayer(50,0,7),probes:number[]=[];
    setMissileAimCallback((_source,angle,range)=>{assert.equal(range,1024*F);probes.push(Math.round((angle/(2*Math.PI))*2**32)>>>0);return {slope:probes.length===expected.hit?F/4:0,target:probes.length===expected.hit?player.mo:null};});
    const missile=spawnPlayerMissile(player,0,'MT_ROCKET')!;
    assert.deepEqual(probes,expected.probes);
    assert.equal(Math.round(missile.angle/(2*Math.PI)*2**32)>>>0,expected.angle);
    assert.equal(missile.momz,expected.momz);
    // C oracle stubs P_CheckMissileSpawn; undo our initial half-tic Z step.
    assert.equal(missile.z-(missile.momz>>1),expected.z);
  }
  initAttackSystem();
});

test('P_XYMovement does not insert extra eight-unit projectile collision steps',()=>{
  const map=dividedMap();map.linedefs[0].left=-1;map.linedefs[0].flags=0;
  resetThinkers();allMobjs.length=0;initMobjSystem({},new Group(),map);
  const shot=spawnMobj(12*F,0,32*F,'MT_TROOPSHOT');shot.momx=-10*F;
  runThinkers();assert.equal(shot.x,12*F);assert.equal(shot.momx,0);assert.equal(shot.state,shot.info.deathState);
  resetThinkers();allMobjs.length=0;
});

test('overlapping projectile candidates follow block-link order, including same-block relinking',async()=>{
  const {tryMove}=await import('../src/physics/DoomMovement');
  const {getMobjMapData}=await import('../src/game/Mobj');
  for(const movePlayer of [false,true]){
    setup();const player=spawnMobj(40*F,0,0,'MT_PLAYER'),monster=spawnMobj(78*F,0,0,'MT_POSSESSED');
    const source=spawnMobj(-80*F,0,0,'MT_TROOP');
    if(movePlayer)assert(tryMove(player,41*F,0,getMobjMapData()!));
    const shot=spawnMobj(60*F,0,32*F,'MT_TROOPSHOT');shot.target=source;shot.momx=F;
    runThinkers();assert.equal(player.health<100,movePlayer);assert.equal(monster.health<20,!movePlayer);
  }
  resetThinkers();allMobjs.length=0;
});
