import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from 'koota';
import {Input,PlayerStatus,DoomWorld} from '../src/ecs/traits';
import {createPlayer} from '../src/physics/DoomMovement';
import {WeaponSystem} from '../src/game/Weapons';
import {dividedMap} from './fixtures/maps';
function setup(weapon:'pistol'|'shotgun'|'missile'|'fist'='pistol'){
  const world=createWorld(Input,PlayerStatus,DoomWorld),state=world.get(PlayerStatus)!,player=createPlayer(40,0,0);
  world.set(DoomWorld,{player,map:dividedMap()});state.currentWeapon=weapon;state.weapons[weapon]=true;state.ammo.shell=8;state.ammo.misl=10;
  const system=new WeaponSystem();system.setup(state);for(let i=0;i<20;i++)system.tick(world);
  return {world,state,player,system};
}
test('P_FireWeapon uses the current tic command and synchronizes attack/flash/ready actor states',()=>{
  const {world,state,player,system}=setup('shotgun');
  world.set(Input,{attack:true});system.tick(world);
  assert.equal(system.psprites[0].state,'SGUN1');assert.equal(state.mobjState.name,'S_PLAY_ATK1');assert.equal(player.mo.state,'S_PLAY_ATK1');
  world.set(Input,{attack:false});for(let i=0;i<3;i++)system.tick(world);
  assert.equal(state.ammo.shell,7);assert.equal(player.mo.state,'S_PLAY_ATK2');assert.equal(state.mobjState.name,'S_PLAY_ATK2');
  for(let i=0;i<50;i++)system.tick(world);
  assert.equal(player.mo.state,'S_PLAY');assert.equal(state.mobjState.name,'S_PLAY');world.destroy();
});
test('A_ReFire preserves held rocket cadence and release does not produce delayed shots',()=>{
  const {world,system}=setup('missile');let shots=0;system.setMissileCallback(()=>shots++);
  world.set(Input,{attack:true});for(let i=0;i<100;i++)system.tick(world);assert.equal(shots,5);
  world.set(Input,{attack:false});system.tick(world);world.set(Input,{attack:true});for(let i=0;i<20;i++)system.tick(world);assert.equal(shots,6);world.destroy();
  const p=setup();p.world.set(Input,{attack:true});p.system.tick(p.world);p.world.set(Input,{attack:false});
  for(let i=0;i<100;i++)p.system.tick(p.world);assert.equal(p.state.ammo.clip,49);p.world.destroy();
});

test('P_BulletSlope samples once at 1024 units before shotgun pellets mutate targets',()=>{
  const {world,system}=setup('shotgun');let aims=0;const slopes:number[]=[];
  system.setAimCallback((_angle,range)=>{assert.equal(range,1024*65536);return ++aims*1234;});
  system.setFireCallback((_angle,slope)=>{slopes.push(slope);});
  world.set(Input,{attack:true});for(let i=0;i<4;i++)system.tick(world);
  assert.equal(aims,1);assert.deepEqual(slopes,Array(7).fill(1234));world.destroy();
});

test('A_Punch aims its spread ray and turns toward a hit target only',async()=>{
  const {archiveRandom,restoreRandom}=await import('../src/game/DoomRandom');
  const {pointToRadians}=await import('../src/math/angles');
  const {world,system,player}=setup('fist');const target=createPlayer(60,30,0).mo;
  let aim=0,shots=0;
  system.setAimCallback((angle,range)=>{aim=angle;assert.equal(range,64*65536);return 123;});
  system.setFireCallback((angle,slope,_damage,range)=>{shots++;assert.equal(angle,aim);assert.equal(slope,123);assert.equal(range,64*65536);return target;});
  restoreRandom({play:0,misc:0});
  world.set(Input,{attack:true});for(let i=0;i<5;i++)system.tick(world);
  assert.equal(shots,1);assert.equal(archiveRandom().play,3);
  assert.equal(aim,Math.PI/2+(109-220)*(Math.PI*2/16384));
  assert.equal(player.mo.angle,pointToRadians(target.x-player.mo.x,target.y-player.mo.y));
  world.destroy();
  const miss=setup('fist'),before=miss.player.mo.angle;miss.system.setFireCallback(()=>null);
  miss.world.set(Input,{attack:true});for(let i=0;i<5;i++)miss.system.tick(miss.world);
  assert.equal(miss.player.mo.angle,before);miss.world.destroy();
});
