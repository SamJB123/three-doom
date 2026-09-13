import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {allMobjs,initMobjSystem,spawnMapThing,setMobjLevelTimeSource} from '../src/game/Mobj';
import {resetThinkers,runThinkers} from '../src/game/Thinkers';
import {archiveRandom,restoreRandom} from '../src/game/DoomRandom';
import {gameRules} from '../src/game/GameRules';
import {MF_SOLID,MF_SHOOTABLE,MF_CORPSE} from '../src/game/MobjData';
import {dividedMap} from './fixtures/maps';
function corpse(type=3004){
  resetThinkers();allMobjs.length=0;gameRules.skill=5;initMobjSystem({},new Group(),dividedMap());
  const mo=spawnMapThing({type,x:50,y:0,angle:90,flags:15})!;
  mo.health=0;mo.flags=(mo.flags&~(MF_SOLID|MF_SHOOTABLE))|MF_CORPSE;mo.tics=-1;mo.movecount=419;
  return mo;
}
test('Nightmare respawn uses global tic cadence, source flags, two fogs and reaction delay',()=>{
  const dead=corpse();let tic=31;setMobjLevelTimeSource(()=>tic);
  restoreRandom({play:255,misc:0});runThinkers();assert(!dead.removed);assert.equal(archiveRandom().play,255);
  tic=32;runThinkers();assert(dead.removed);
  assert.equal(allMobjs.filter(m=>m.type==='MT_TFOG').length,2);
  const replacement=allMobjs.find(m=>m.type==='MT_POSSESSED')!;
  assert.equal(replacement.reactionTime,18);assert.equal(replacement.angle,Math.PI/2);assert.equal(replacement.health,20);
});
test('lost souls do not Nightmare-respawn, and occupied spawn points retain corpses',()=>{
  const skull=corpse(3006);setMobjLevelTimeSource(()=>32);restoreRandom({play:255,misc:0});runThinkers();assert(!skull.removed);assert.equal(archiveRandom().play,255);
  const dead=corpse();spawnMapThing({type:30,x:50,y:0,angle:0,flags:7});
  restoreRandom({play:255,misc:0});runThinkers();assert(!dead.removed);assert.equal(allMobjs.filter(m=>m.type==='MT_TFOG').length,0);
  gameRules.skill=3;
});
