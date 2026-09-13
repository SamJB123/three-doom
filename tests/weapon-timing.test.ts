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
  assert.equal(aim,(109-220)*(Math.PI*2/16384));
  assert.equal(player.mo.angle,pointToRadians(target.x-player.mo.x,target.y-player.mo.y));
  world.destroy();
  const miss=setup('fist'),before=miss.player.mo.angle;miss.system.setFireCallback(()=>null);
  miss.world.set(Input,{attack:true});for(let i=0;i<5;i++)miss.system.tick(miss.world);
  assert.equal(miss.player.mo.angle,before);miss.world.destroy();
});

test('A_Saw uses spread/aim, hit-only facing and pull flag; a miss retains player heading',async()=>{
  const {clearRandom,archiveRandom}=await import('../src/game/DoomRandom');
  const {MF_JUSTATTACKED}=await import('../src/game/MobjData');
  const {radiansToAngle}=await import('../src/math/angles');
  const {world,state,player,system}=setup();state.currentWeapon='chainsaw';state.weapons.chainsaw=true;
  const target=createPlayer(40,50,0).mo;player.mo.angle=0;
  (system as any).playerActor=player.mo;(system as any).lastAngle=0;
  let aimAngle=0;
  system.setAimCallback((angle,range)=>{aimAngle=angle;assert.equal(range,64*65536+1);return 123;});
  system.setFireCallback((angle,slope,damage,range)=>{
    assert.equal(angle,aimAngle);assert.equal(slope,123);assert.equal(damage,18);assert.equal(range,64*65536+1);return target;
  });
  clearRandom();(system as any).A_Saw(state);
  assert.equal(aimAngle,(109-220)*Math.PI*2/16384);assert.equal(archiveRandom().play,3);
  assert.equal(radiansToAngle(player.mo.angle),0x3fffffff-Math.trunc(0x40000000/21));
  assert.ok(player.mo.flags&MF_JUSTATTACKED);
  player.mo.flags&=~MF_JUSTATTACKED;const before=player.mo.angle;system.setFireCallback(()=>null);
  clearRandom();(system as any).A_Saw(state);
  assert.equal(player.mo.angle,before);assert.equal(player.mo.flags&MF_JUSTATTACKED,0);world.destroy();
});
test('P_CheckAmmo chooses remaining rockets/BFG, respects retail exclusions and source thresholds',()=>{
  const {world,state,system}=setup();
  state.ammo={clip:0,shell:0,misl:1,cell:0};state.weapons.missile=true;
  assert.equal((system as any).checkAmmo(state),false);assert.equal(state.pendingWeapon,'missile');
  state.weapons.chainsaw=true;(system as any).checkAmmo(state);assert.equal(state.pendingWeapon,'chainsaw');
  state.weapons.chainsaw=false;state.ammo.misl=0;state.weapons.bfg=true;state.ammo.cell=40;
  (system as any).checkAmmo(state);assert.equal(state.pendingWeapon,'fist');
  state.ammo.cell=41;(system as any).checkAmmo(state);assert.equal(state.pendingWeapon,'bfg');
  state.weapons.plasma=true;(system as any).checkAmmo(state);assert.equal(state.pendingWeapon,'plasma');
  state.weapons.plasma=false;state.ammo.cell=0;state.weapons.supershotgun=true;state.ammo.shell=3;
  (system as any).checkAmmo(state);assert.equal(state.pendingWeapon,'fist');
  state.weapons.shotgun=true;(system as any).checkAmmo(state);assert.equal(state.pendingWeapon,'shotgun');world.destroy();
});
