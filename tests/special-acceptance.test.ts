import test from 'node:test';
import assert from 'node:assert/strict';
import {dividedMap,sector} from './fixtures/maps';
import {resetThinkers,runThinkers,archiveThinkers,busySectors} from '../src/game/Thinkers';
import {evDoDoor,resetDoors} from '../src/game/Doors';
import {evDoPlat,resetPlatforms,evStopPlat} from '../src/game/Platforms';
import {evBuildStairs,resetStairs} from '../src/game/Stairs';
import {setSectorChangeCallback,movePlane} from '../src/game/SectorHelpers';
import {restoreRandom} from '../src/game/DoomRandom';
const ticks=(n:number)=>{for(let i=0;i<n;i++)runThinkers();};
const state=()=>archiveThinkers()[0]?.data as any;
function clean(){resetThinkers();resetDoors();resetPlatforms();resetStairs();setSectorChangeCallback(()=>false);}

test('T_VerticalDoor reverses normal doors at an obstruction but retries close-only doors',()=>{
  for(const type of ['normal','close'] as const){
    clean();const m=dividedMap(),s=m.sectors[1];s.tag=7;s.ceilingHeight=56;
    setSectorChangeCallback(sector=>sector===s&&sector.ceilingHeight<56);
    evDoDoor(type,7,m.linedefs,m.sidedefs,m.sectors);
    if(type==='normal'){ticks(35+150+34);assert.equal(s.ceilingHeight,56);}
    runThinkers();assert.equal(s.ceilingHeight,56);assert.equal(state().direction,type==='normal'?1:-1);
    if(type==='close'){
      ticks(5);assert.equal(s.ceilingHeight,56);
      setSectorChangeCallback(()=>false);ticks(29);assert.equal(s.ceilingHeight,0);assert.equal(busySectors.size,0);
    }else{runThinkers();assert.equal(s.ceilingHeight,58);}
  }clean();
});

test('T_PlatRaise reverses an obstructed return, waits at the bottom and completes after clearance',()=>{
  clean();const m=dividedMap(),s=m.sectors[1];s.tag=7;s.floorHeight=32;
  evDoPlat('downWaitUpStay',7,0,m.linedefs,m.sidedefs,m.sectors);
  ticks(9+105);assert.equal(s.floorHeight,0);assert.equal(state().status,'up');
  setSectorChangeCallback(sector=>sector===s&&sector.floorHeight>16);
  ticks(5);assert.equal(s.floorHeight,16);assert.equal(state().status,'down');
  ticks(5);assert.equal(s.floorHeight,0);assert.equal(state().status,'waiting');
  setSectorChangeCallback(()=>false);ticks(105+9);assert.equal(s.floorHeight,32);assert.equal(busySectors.size,0);
  clean();
});

test('perpetual platforms complete repeated cycles and resume the same direction after stasis',()=>{
  clean();const m=dividedMap(),s=m.sectors[1];s.tag=7;s.floorHeight=16;
  restoreRandom({play:0,misc:0});evDoPlat('perpetualRaise',7,0,m.linedefs,m.sidedefs,m.sectors);
  const seen=new Set<string>();
  for(let i=0;i<500;i++){runThinkers();assert(s.floorHeight>=0&&s.floorHeight<=16);seen.add(`${s.floorHeight}:${state().status}`);}
  assert(seen.has('0:waiting'));assert(seen.has('16:waiting'));assert(seen.has('8:up'));assert(seen.has('8:down'));
  const before=structuredClone(state()),height=s.floorHeight;
  evStopPlat(7);ticks(200);assert.equal(s.floorHeight,height);
  evDoPlat('perpetualRaise',7,0,m.linedefs,m.sidedefs,m.sectors);
  assert.equal(archiveThinkers().length,1);assert.equal(state().status,before.status);assert.equal(state().count,before.count);
  clean();
});

test('T_MovePlane retains endpoint rollback and completion semantics under obstruction',()=>{
  for(const plane of [0,1])for(const direction of [-1,1]){
    const s=sector(32,64),key=plane===0?'floorHeight':'ceilingHeight',start=s[key];
    const changes:number[]=[];setSectorChangeCallback(sector=>{changes.push(sector[key]);return true;});
    assert.equal(movePlane(s,2,start+direction,true,plane,direction),'pastdest');
    assert.equal(s[key],start);assert.deepEqual(changes,[start+direction,start]);
  }clean();
});

test('EV_BuildStairs counts a busy matching branch before selecting the next free neighbor',()=>{
  clean();const m=dividedMap();m.sectors.push(sector());m.sectors[0].tag=7;
  m.sidedefs.push({...m.sidedefs[1],sector:2});m.linedefs.push({...m.linedefs[0],left:2});
  busySectors.add(1);evBuildStairs('build8',7,m.linedefs,m.sidedefs,m.sectors);
  ticks(97);assert.equal(m.sectors[0].floorHeight,8);assert.equal(m.sectors[1].floorHeight,0);
  assert.equal(m.sectors[2].floorHeight,24,'original height increment precedes the specialdata/busy check');
  clean();
});
