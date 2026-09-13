import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from 'koota';
import {Group} from 'three/webgpu';
import {Time,Input,DoomWorld,PlayerStatus} from '../src/ecs/traits';
import {playerTickSystem,playerMobjTickSystem} from '../src/ecs/systems';
import {createPlayer} from '../src/physics/DoomMovement';
import {allMobjs,initMobjSystem,restoreMobjThinker,setPlayerThinkerCallback} from '../src/game/Mobj';
import {addThinker,resetThinkers,archiveThinkers} from '../src/game/Thinkers';
import {dividedMap} from './fixtures/maps';
import {FRACUNIT as F} from '../src/math/fixed';

test('weapons run before actor thinkers; player movement runs once in its insertion slot',()=>{
  resetThinkers();allMobjs.length=0;
  const map=dividedMap(),player=createPlayer(50,0,0);
  initMobjSystem({},new Group(),map);
  const world=createWorld(Time,Input,DoomWorld,PlayerStatus);
  world.set(DoomWorld,{map,player});world.set(Input,{forward:1,yaw:-Math.PI/2});
  const status=world.get(PlayerStatus)!;status.powers.invisibility=1;
  const sequence:string[]=[];
  addThinker(()=>{sequence.push('before player');assert.equal(player.mo.x,50*F);assert.equal(status.powers.invisibility,0);return false;});
  allMobjs.push(player.mo);restoreMobjThinker(player.mo);
  setPlayerThinkerCallback(()=>{sequence.push('player');playerMobjTickSystem(world);});
  addThinker(()=>{sequence.push('after player');assert(player.mo.x>50*F);return false;});
  playerTickSystem(world,()=>{
    sequence.push('weapon');assert.equal(player.mo.x,50*F);assert.equal(status.powers.invisibility,1);
    addThinker(()=>{sequence.push('new projectile');return false;});
  });
  assert.deepEqual(sequence,['weapon','before player','player','after player','new projectile']);
  assert.equal(world.get(Time)!.levelTime,1);
  assert.deepEqual(archiveThinkers(),[{kind:'mobj',data:0}]);
  world.destroy();resetThinkers();allMobjs.length=0;
});
test('P_MovePlayer starts walking before thinkers, and P_XYMovement stops the animation only without a command',()=>{
  resetThinkers();allMobjs.length=0;
  const map=dividedMap(),player=createPlayer(50,0,0);
  initMobjSystem({},new Group(),map);
  const world=createWorld(Time,Input,DoomWorld,PlayerStatus);
  world.set(DoomWorld,{map,player});world.set(Input,{forward:1,yaw:-Math.PI/2});
  allMobjs.push(player.mo);restoreMobjThinker(player.mo);
  setPlayerThinkerCallback(()=>playerMobjTickSystem(world));
  const status=world.get(PlayerStatus)!;
  player.mo.reactionTime=1;playerTickSystem(world);
  assert.equal(status.mobjState.name,'S_PLAY');
  playerTickSystem(world,()=>assert.deepEqual(status.mobjState,{name:'S_PLAY_RUN1',tics:4}));
  assert.deepEqual(status.mobjState,{name:'S_PLAY_RUN1',tics:3});
  player.mo.momx=100;player.mo.momy=0;playerMobjTickSystem(world);
  assert(player.mo.momx>0);assert.equal(status.mobjState.name,'S_PLAY_RUN1');
  world.set(Input,{forward:0});playerMobjTickSystem(world);
  assert.equal(player.mo.momx,0);assert.deepEqual(status.mobjState,{name:'S_PLAY',tics:-1});
  world.destroy();resetThinkers();allMobjs.length=0;
});

test('teleport reaction time freezes turning and thrust while weapons use the actor angle',async()=>{
  const {WeaponSystem}=await import('../src/game/Weapons');
  resetThinkers();allMobjs.length=0;const map=dividedMap(),player=createPlayer(50,0,0);
  initMobjSystem({},new Group(),map);const world=createWorld(Time,Input,DoomWorld,PlayerStatus);
  world.set(DoomWorld,{map,player});const weapon=new WeaponSystem();weapon.setup(world.get(PlayerStatus)!);
  for(let i=0;i<20;i++)weapon.tick(world);
  let shot:number|undefined;weapon.setFireCallback(angle=>{shot=angle;});
  player.mo.angle=Math.PI/4;player.mo.reactionTime=5;
  world.set(Input,{forward:1,yaw:-Math.PI/2,attack:true});
  for(let i=0;i<5;i++)playerTickSystem(world,()=>weapon.tick(world));
  assert.equal(player.mo.angle,Math.PI/4);assert.equal(shot,Math.PI/4);
  assert.equal(player.mo.momx,0);assert.equal(player.mo.momy,0);assert.equal(player.mo.reactionTime,0);
  world.set(Input,{forward:0,attack:false});playerTickSystem(world,()=>weapon.tick(world));
  assert.equal(player.mo.angle,0);world.destroy();resetThinkers();allMobjs.length=0;
});

test('P_PlayerThink consumes chainsaw pull once and preserves attack/use buttons',async()=>{
  const {MF_JUSTATTACKED}=await import('../src/game/MobjData');
  resetThinkers();allMobjs.length=0;
  const map=dividedMap(),player=createPlayer(50,0,0);initMobjSystem({},new Group(),map);
  const world=createWorld(Time,Input,DoomWorld,PlayerStatus);world.set(DoomWorld,{map,player});
  player.mo.angle=0;player.mo.flags|=MF_JUSTATTACKED;
  world.set(Input,{forward:-1,strafe:1,run:true,yaw:0,attack:true,use:false});
  playerTickSystem(world,()=>{
    const command=world.get(Input)!;assert.equal(command.forward,4);assert.equal(command.strafe,0);
    assert.equal(command.run,false);assert.equal(command.attack,true);assert.equal(player.mo.angle,0);
    assert.equal(player.mo.flags&MF_JUSTATTACKED,0);assert.ok(player.mo.momx>0);
  });
  world.set(Input,{forward:0,strafe:0,run:false,yaw:0});playerTickSystem(world);
  assert.equal(player.mo.angle,Math.PI/2);world.destroy();resetThinkers();allMobjs.length=0;
});

test('P_DeathThink turns toward killer before fading damage and clamps corpse view height',async()=>{
  const {pointToAngle,radiansToAngle}=await import('../src/math/angles');
  resetThinkers();allMobjs.length=0;
  const map=dividedMap(),player=createPlayer(50,0,0);initMobjSystem({},new Group(),map);
  const attacker=createPlayer(50,100,0).mo;player.mo.lastAttacker=attacker;player.mo.angle=0;
  const world=createWorld(Time,Input,DoomWorld,PlayerStatus);world.set(DoomWorld,{map,player});
  const state=world.get(PlayerStatus)!;state.health=0;state.playerState='PST_DEAD';state.damageCount=40;
  playerTickSystem(world);assert.equal(radiansToAngle(player.mo.angle),Math.trunc(0x40000000/18));assert.equal(state.damageCount,40);
  for(let i=0;i<20;i++)playerTickSystem(world);
  assert.equal(radiansToAngle(player.mo.angle),pointToAngle(0,100*F));assert.ok(state.damageCount<40);
  player.viewheight=6*F+F/2;playerTickSystem(world);assert.equal(player.viewheight,6*F);assert.equal(player.deltaviewheight,0);
  player.mo.lastAttacker=null;const before=state.damageCount;playerTickSystem(world);assert.equal(state.damageCount,before-1);
  world.destroy();resetThinkers();allMobjs.length=0;
});
