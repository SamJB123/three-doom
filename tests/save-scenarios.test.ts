import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from 'koota';
import {Group} from 'three/webgpu';
import {Time,Input,DoomWorld,PlayerStatus,createPlayerStatus} from '../src/ecs/traits';
import {playerTickSystem,playerMobjTickSystem} from '../src/ecs/systems';
import {createPlayer} from '../src/physics/DoomMovement';
import {initMobjSystem,allMobjs,spawnMobj,resetMobjs,restoreMobjThinker,setPlayerThinkerCallback,setMobjLevelTimeSource} from '../src/game/Mobj';
import {initAttackSystem,setAttackMap,setPlayerDamageMobjCallback,lineAttack,bulletSlope} from '../src/game/Attack';
import {initEnemyAI,setPlayerMobj,advanceEnemyTic} from '../src/game/EnemyAI';
import {damagePlayer} from '../src/game/PlayerDamage';
import {WeaponSystem} from '../src/game/Weapons';
import {archiveWorld,restoreWorld} from '../src/game/WorldArchive';
import {resetThinkers} from '../src/game/Thinkers';
import {clearRandom} from '../src/game/DoomRandom';
import {evDoDoor,resetDoors} from '../src/game/Doors';
import {evDoPlat,resetPlatforms} from '../src/game/Platforms';
import {evDoCeiling,resetCeilings} from '../src/game/Ceilings';
import {evBuildStairs,resetStairs} from '../src/game/Stairs';
import {resetFloors} from '../src/game/Floors';
import {resetUseActions} from '../src/game/UseAction';
import {setSectorChangeCallback,setSectorTicSource} from '../src/game/SectorHelpers';
import {sectorChangeHandler} from '../src/game/SectorOccupants';
import {dividedMap} from './fixtures/maps';
import {FRACUNIT as F} from '../src/math/fixed';

// p_saveg.c's requirement is a continued world, not just equal JSON at load.
for(const family of ['door','lift','crusher','stairs','death'] as const)test(`save continuation through ${family}, combat, projectiles, links and power expiry`,()=>{
  resetThinkers();resetMobjs();resetDoors();resetPlatforms();resetCeilings();resetStairs();resetFloors();resetUseActions();clearRandom();
  const map=dividedMap();map.sectors[1].tag=8;
  if(family==='door')map.sectors[1].ceilingHeight=0;
  if(family==='lift')map.sectors[1].floorHeight=32;
  if(family==='crusher')map.sectors[1].ceilingHeight=64;
  initMobjSystem({},new Group(),map);initAttackSystem();setAttackMap(map);initEnemyAI();
  const player=createPlayer(family==='door'?60:-60,0,family==='lift'?32:0);
  player.mo.ceilingz=(family==='crusher'?64:128)*F;player.mo.sectorIndex=family==='door'?0:1;
  allMobjs.push(player.mo);restoreMobjThinker(player.mo);setPlayerMobj(player.mo);
  const world=createWorld(Time,Input,DoomWorld,PlayerStatus);world.set(DoomWorld,{map,player});
  const state=createPlayerStatus();state.didSecret=true;state.cards.bluecard=true;
  Object.assign(state.powers,{invisibility:53,infrared:70,ironfeet:80,invulnerability:31,strength:1});world.set(PlayerStatus,state);
  const weapons=new WeaponSystem();weapons.setup(world.get(PlayerStatus)!);
  weapons.setBulletAimCallback(angle=>bulletSlope(player.mo,angle));
  weapons.setFireCallback((angle,slope,damage,range)=>lineAttack(player.mo.x,player.mo.y,player.mo.z+(player.mo.height>>1)+8*F,angle,slope,range,damage,player.mo));
  setPlayerThinkerCallback(()=>playerMobjTickSystem(world));
  setMobjLevelTimeSource(()=>world.get(Time)!.levelTime);setSectorTicSource(()=>world.get(Time)!.levelTime);
  setSectorChangeCallback(sectorChangeHandler(map,()=>world.get(Time)!.levelTime));
  setPlayerDamageMobjCallback((damage,_inflictor,source)=>damagePlayer(world.get(PlayerStatus)!,damage,0,player.mo,source));
  const monster=spawnMobj(200*F,0,0,'MT_TROOP');monster.target=player.mo;player.mo.lastAttacker=monster;
  if(family==='door')evDoDoor('normal',8,map.linedefs,map.sidedefs,map.sectors);
  if(family==='lift')evDoPlat('downWaitUpStay',8,0,map.linedefs,map.sidedefs,map.sectors);
  if(family==='crusher')evDoCeiling('crushAndRaise',8,map.linedefs,map.sidedefs,map.sectors);
  if(family==='stairs')evBuildStairs('build8',8,map.linedefs,map.sidedefs,map.sectors);
  if(family==='death')damagePlayer(world.get(PlayerStatus)!,1000,0,player.mo,monster);
  const tick=(command:number)=>{
    world.set(Input,{forward:0,strafe:0,yaw:-Math.PI/2,pitch:0,attack:command%12<6,use:false,weaponSelect:-1});
    playerTickSystem(world,()=>weapons.tick(world));advanceEnemyTic();
  };
  for(let i=0;i<7;i++)tick(i);
  const projectile=spawnMobj(200*F,0,32*F,'MT_TROOPSHOT');projectile.target=monster;projectile.tracer=player.mo;projectile.momx=-10*F;
  const capture=()=>structuredClone({world:archiveWorld(map,player),player:world.get(PlayerStatus)!,weapons:weapons.archive(),tic:world.get(Time)!.levelTime});
  const saved=JSON.parse(JSON.stringify(capture()));
  const expected=[];for(let i=0;i<160;i++){tick(i);expected.push(capture());}
  restoreWorld(map,player,saved.world);world.set(PlayerStatus,saved.player);weapons.restore(saved.weapons);world.set(Time,{levelTime:saved.tic});
  assert.deepEqual(capture(),saved);
  for(let i=0;i<160;i++){tick(i);assert.deepEqual(capture(),expected[i],`${family} resumed tic ${i}`);}
  if(family!=='death')assert.equal(world.get(PlayerStatus)!.powers.invulnerability,0);
  assert.equal(world.get(PlayerStatus)!.didSecret,true);assert.equal(world.get(PlayerStatus)!.cards.bluecard,true);
  world.destroy();resetThinkers();resetMobjs();setPlayerThinkerCallback(()=>{});setSectorChangeCallback(()=>false);setMobjLevelTimeSource(()=>0);setSectorTicSource(()=>0);
});
