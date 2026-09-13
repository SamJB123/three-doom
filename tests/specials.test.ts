import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {dividedMap,sector} from './fixtures/maps';
import {resetThinkers,runThinkers,archiveThinkers} from '../src/game/Thinkers';
import {evDoFloor,evDoDonut,resetFloors,setFloorTextureHeights} from '../src/game/Floors';
import {evDoPlat,evStopPlat,resetPlatforms} from '../src/game/Platforms';
import {resetDoors} from '../src/game/Doors';
import {useSpecialLine,crossSpecialLine} from '../src/game/UseAction';
import {createPlayer} from '../src/physics/DoomMovement';
import {createPlayerStatus} from '../src/ecs/traits';
import {lineAttack,setAttackMap,initAttackSystem} from '../src/game/Attack';
import {initMobjSystem,resetMobjs,spawnMobj} from '../src/game/Mobj';
import {FRACUNIT as F} from '../src/math/fixed';
import {consumeTeleport} from '../src/game/Teleport';

function clean(){resetThinkers();resetFloors();resetPlatforms();resetDoors();resetMobjs();}
test('lower-and-change transfers destination texture/special on arrival; raise-to-texture uses shortest lower texture',()=>{
  clean();const m=dividedMap();m.sectors[0].floorHeight=16;m.sectors[0].tag=7;
  m.sectors[1].floorTex='NUKAGE1';m.sectors[1].special=5;
  evDoFloor('lowerAndChange',7,m.linedefs,m.sidedefs,m.sectors);
  runThinkers();assert.notEqual(m.sectors[0].floorTex,'NUKAGE1');
  for(let i=0;i<16;i++)runThinkers();
  assert.equal(m.sectors[0].floorHeight,0);assert.equal(m.sectors[0].floorTex,'NUKAGE1');assert.equal(m.sectors[0].special,5);
  m.sidedefs[0].lower='SHORT';m.sidedefs[1].lower='TALL';setFloorTextureHeights({SHORT:24,TALL:64});
  evDoFloor('raiseToTexture',7,m.linedefs,m.sidedefs,m.sectors);
  for(let i=0;i<25;i++)runThinkers();assert.equal(m.sectors[0].floorHeight,24);clean();
});
test('donut raises ring, lowers pillar, and changes ring texture when complete',()=>{
  clean();const m=dividedMap();m.sectors=[sector(32),sector(-16),sector(0)];m.sectors[0].tag=7;m.sectors[2].floorTex='FLAT1';
  m.sidedefs=[0,1,2].map(sector=>({sector,xoff:0,yoff:0,upper:'-',middle:'-',lower:'-'}));
  m.linedefs=[{...m.linedefs[0],right:0,left:1},{...m.linedefs[0],right:1,left:2}];
  assert(evDoDonut(7,m.linedefs,m.sidedefs,m.sectors));assert.equal(archiveThinkers().length,2);
  for(let i=0;i<65;i++)runThinkers();
  assert.equal(m.sectors[0].floorHeight,0);assert.equal(m.sectors[1].floorHeight,0);assert.equal(m.sectors[1].floorTex,'FLAT1');clean();
});
test('platform stop/resume keeps one thinker and blocks a competing floor action',()=>{
  clean();const m=dividedMap();m.sectors[0].floorHeight=16;m.sectors[0].tag=7;
  evDoPlat('downWaitUpStay',7,0,m.linedefs,m.sidedefs,m.sectors);runThinkers();assert.equal(m.sectors[0].floorHeight,12);
  evStopPlat(7);runThinkers();assert.equal(m.sectors[0].floorHeight,12);
  assert.equal(evDoFloor('raiseFloor24',7,m.linedefs,m.sidedefs,m.sectors),false);
  evDoPlat('perpetualRaise',7,0,m.linedefs,m.sidedefs,m.sectors);runThinkers();assert.equal(m.sectors[0].floorHeight,8);
  assert.equal(archiveThinkers().length,1);clean();
});
test('all locked fast-door switch colors accept matching skulls and reject missing keys',()=>{
  for(const special of [99,133,134,135,136,137]) {
    clean();const m=dividedMap();m.sectors[1].ceilingHeight=0;m.sectors[1].tag=7;
    const line={...m.linedefs[0],special,tag:7},state=createPlayerStatus();
    useSpecialLine(line,m,state);runThinkers();assert.equal(m.sectors[1].ceilingHeight,0);
    const key=[99,133].includes(special)?'blueskull':[134,135].includes(special)?'redskull':'yellowskull';state.cards[key]=true;
    useSpecialLine(line,m,state);runThinkers();assert.equal(m.sectors[1].ceilingHeight,8);
  }clean();
});
test('hitscan activates shootable door through actual lineAttack path',()=>{
  clean();const m=dividedMap();m.sectors[1].ceilingHeight=0;m.sectors[1].tag=7;m.linedefs[0].tag=7;m.linedefs[0].special=46;
  setAttackMap(m);initAttackSystem();
  const player=createPlayer(60,0,0).mo;
  lineAttack(player.x,player.y,36*F,Math.PI,0,2048*F,5,player);runThinkers();
  assert.equal(m.sectors[1].ceilingHeight,2);assert.equal(m.linedefs[0].special,46);clean();
});
test('monster-only teleports ignore players, move monsters, and do not alter player view',()=>{
  clean();const m=dividedMap();m.sectors[1].tag=7;initMobjSystem({},new Group(),m);consumeTeleport();
  const player=createPlayer(60,0,0),line={...m.linedefs[0],special:125,tag:7};
  const things=[{type:14,x:-80,y:0,angle:90,flags:7}];
  crossSpecialLine(line,m,player,things,0,player.mo);assert.equal(line.special,125);assert.equal(player.mo.x,60*F);
  const monster=spawnMobj(60*F,0,0,'MT_TROOP');
  crossSpecialLine(line,m,player,things,0,monster);assert.equal(monster.x,-80*F);assert.equal(line.special,0);assert.equal(consumeTeleport(),null);clean();
});
test('tagged lights change on crossing and clear one-shot specials',()=>{
  clean();const m=dividedMap();m.sectors[0].tag=7;m.sectors[1].lightLevel=80;
  for(const [special,expected] of [[13,255],[35,35],[104,35]]){
    const line={...m.linedefs[0],special,tag:7};crossSpecialLine(line,m);assert.equal(m.sectors[0].lightLevel,expected);assert.equal(line.special,0);
  }clean();
});
