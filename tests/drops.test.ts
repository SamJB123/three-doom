import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {createWorld} from 'koota';
import {PlayerStatus} from '../src/ecs/traits';
import {FRACUNIT as F} from '../src/math/fixed';
import {dividedMap} from './fixtures/maps';
import {allMobjs,initMobjSystem,spawnMobj,archiveMobjs} from '../src/game/Mobj';
import {damageMobj,setAttackMap} from '../src/game/Attack';
import {MF_DROPPED,MF_FLOAT,MF_NOGRAVITY,MF_SOLID,MF_CORPSE,MF_DROPOFF} from '../src/game/MobjData';
import {resetThinkers,runThinkers} from '../src/game/Thinkers';
import {checkPickups} from '../src/game/Pickups';
import {gameRules} from '../src/game/GameRules';
import {A_Fall} from '../src/game/EnemyAI';
function setup(){resetThinkers();allMobjs.length=0;const map=dividedMap();initMobjSystem({},new Group(),map);setAttackMap(map);gameRules.skill=3;}

test('monster deaths drop source-defined items and dropped ammo quantities',()=>{
  for(const [monster,item,ammo,amount] of [
    ['MT_POSSESSED','MT_CLIP','clip',5],['MT_SHOTGUY','MT_SHOTGUN','shell',4],['MT_CHAINGUY','MT_CHAINGUN','clip',10],
  ] as const){
    setup();const mo=spawnMobj(50*F,0,0,monster);damageMobj(mo,null,null,10000);
    const drop=allMobjs.find(actor=>actor.type===item)!;
    assert(drop);assert(drop.flags&MF_DROPPED);assert.equal(drop.z,mo.floorz);
    assert(archiveMobjs().some(actor=>actor.type===item && !!(actor.flags&MF_DROPPED)));
    const world=createWorld(PlayerStatus),state=world.get(PlayerStatus)!;state.ammo[ammo]=0;
    checkPickups(world,new Group(),drop.x,drop.y,drop.z+9*F);assert.equal(state.ammo[ammo],0);
    checkPickups(world,new Group(),drop.x,drop.y,drop.z);assert.equal(state.ammo[ammo],amount);assert(drop.removed);
    checkPickups(world,new Group(),drop.x,drop.y,drop.z);assert.equal(state.ammo[ammo],amount);
    world.destroy();
  }
});

test('full ammo leaves dropped clip available; map clips retain full ammo quantity',()=>{
  setup();const world=createWorld(PlayerStatus),state=world.get(PlayerStatus)!;
  const clip=spawnMobj(50*F,0,0,'MT_CLIP');state.ammo.clip=state.maxAmmo.clip;
  checkPickups(world,new Group(),clip.x,clip.y,clip.z);assert(!clip.removed);
  state.ammo.clip=0;checkPickups(world,new Group(),clip.x,clip.y,clip.z);assert.equal(state.ammo.clip,10);
  world.destroy();
});

test('flying corpses fall; lost souls keep no-gravity; solidity changes at A_Fall',()=>{
  setup();const demon=spawnMobj(50*F,0,64*F,'MT_HEAD');damageMobj(demon,null,null,10000);
  assert(!(demon.flags&MF_FLOAT));assert(!(demon.flags&MF_NOGRAVITY));assert(demon.flags&MF_CORPSE);assert(demon.flags&MF_DROPOFF);assert(demon.flags&MF_SOLID);
  runThinkers();runThinkers();assert(demon.z<64*F);
  A_Fall(demon);assert(!(demon.flags&MF_SOLID));
  const skull=spawnMobj(50*F,0,64*F,'MT_SKULL');damageMobj(skull,null,null,10000);
  assert(skull.flags&MF_NOGRAVITY);assert(!(skull.flags&MF_FLOAT));
});

test('dynamic pickup meshes cannot grant ammo from stale spawn coordinates',async()=>{
  const {Mesh}=await import('three/webgpu');
  setup();const world=createWorld(PlayerStatus),state=world.get(PlayerStatus)!;
  state.ammo.clip=0;const group=new Group(),clip=spawnMobj(100*F,0,0,'MT_CLIP');clip.flags|=MF_DROPPED;
  const mesh=new Mesh();mesh.userData={mobj:clip,thingType:2007,thingX:0,thingY:0};group.add(mesh);
  checkPickups(world,group,0,0,0);
  assert.equal(state.ammo.clip,0);assert.equal(state.bonusCount,0);assert(!clip.removed);
  checkPickups(world,group,clip.x,clip.y,clip.z);
  assert.equal(state.ammo.clip,5);assert(clip.removed);
  checkPickups(world,group,0,0,0);assert.equal(state.ammo.clip,5);
  world.destroy();resetThinkers();allMobjs.length=0;
});
