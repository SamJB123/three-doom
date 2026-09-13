import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {dividedMap} from './fixtures/maps';
import {createPlayer} from '../src/physics/DoomMovement';
import {initMobjSystem,allMobjs,spawnMobj,resetMobjs} from '../src/game/Mobj';
import {archiveWorld,restoreWorld} from '../src/game/WorldArchive';
import {runThinkers,resetThinkers} from '../src/game/Thinkers';
import {spawnLightSpecials} from '../src/game/Lights';
import {clearRandom} from '../src/game/DoomRandom';
import {evDoFloor,resetFloors} from '../src/game/Floors';
import {evDoCeiling,evCeilingCrushStop,resetCeilings} from '../src/game/Ceilings';
import {initEnemyAI,setPlayerMobj} from '../src/game/EnemyAI';
import {FRACUNIT as F} from '../src/math/fixed';

test('world save round-trip preserves actors, targets, RNG, lights, moving floors and continued tics',()=>{
  resetThinkers();resetMobjs();resetFloors();clearRandom();
  const map=dividedMap();initMobjSystem({},new Group(),map);initEnemyAI();
  const player=createPlayer(100,0,0);allMobjs.push(player.mo);setPlayerMobj(player.mo);
  const monster=spawnMobj(-100*F,0,0,'MT_TROOP');monster.target=player.mo;monster.tracer=player.mo;
  map.sectors[0].tag=7;map.sectors[0].special=1;map.sectors[1].lightLevel=80;
  spawnLightSpecials(map.sectors,map.linedefs,map.sidedefs);
  evDoFloor('raiseFloor24',7,map.linedefs,map.sidedefs,map.sectors);
  for(let i=0;i<3;i++)runThinkers();
  const saved=JSON.parse(JSON.stringify(archiveWorld(map,player)));
  const expected=[];
  for(let i=0;i<40;i++){runThinkers();expected.push(archiveWorld(map,player));}
  restoreWorld(map,player,saved);
  assert.deepEqual(archiveWorld(map,player),saved);
  for(let i=0;i<40;i++){runThinkers();assert.deepEqual(archiveWorld(map,player),expected[i],`tic ${i}`);}
  resetThinkers();resetMobjs();resetFloors();
});

test('resuming a stopped crusher keeps exactly one thinker, including after save/load',()=>{
  resetThinkers();resetMobjs();resetCeilings();
  const map=dividedMap();initMobjSystem({},new Group(),map);initEnemyAI();
  const player=createPlayer(100,0,0);allMobjs.push(player.mo);setPlayerMobj(player.mo);
  map.sectors[1].tag=8;
  evDoCeiling('crushAndRaise',8,map.linedefs,map.sidedefs,map.sectors);
  runThinkers();assert.equal(map.sectors[1].ceilingHeight,127);
  evCeilingCrushStop(8);const saved=archiveWorld(map,player);
  restoreWorld(map,player,saved);runThinkers();assert.equal(map.sectors[1].ceilingHeight,127);
  evDoCeiling('crushAndRaise',8,map.linedefs,map.sidedefs,map.sectors);
  runThinkers();assert.equal(map.sectors[1].ceilingHeight,126);
  assert.equal(archiveWorld(map,player).thinkers.length,1);
  resetThinkers();resetMobjs();resetCeilings();
});
