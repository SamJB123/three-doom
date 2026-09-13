import test from 'node:test';
import assert from 'node:assert/strict';
import {dividedMap} from './fixtures/maps';
import {resetThinkers,runThinkers,archiveThinkers,busySectors} from '../src/game/Thinkers';
import {resetDoors} from '../src/game/Doors';
import {resetFloors} from '../src/game/Floors';
import {resetPlatforms} from '../src/game/Platforms';
import {resetCeilings} from '../src/game/Ceilings';
import {resetStairs} from '../src/game/Stairs';
import {setSectorChangeCallback} from '../src/game/SectorHelpers';
import {useSpecialLine,crossSpecialLine,resetUseActions} from '../src/game/UseAction';

function clean(){resetThinkers();resetDoors();resetFloors();resetPlatforms();resetCeilings();resetStairs();resetUseActions();setSectorChangeCallback(()=>false);}
function ticks(n:number){for(let i=0;i<n;i++)runThinkers();}
const state=()=>archiveThinkers()[0]?.data as any;
// P_CrossSpecialLine/P_UseSpecialLine -> EV_DoDoor -> T_VerticalDoor.
// Verify actual travel/wait/removal, not just which thinker was selected.
test('tagged door families travel, wait, close or stay open and release their sectors',()=>{
  const groups=[
    {ids:[2,86,103,61],use:[103,61],repeat:[86,61],mode:'open',speed:2},
    {ids:[109,112,115],use:[112,115],repeat:[115],mode:'open',speed:8},
    {ids:[3,42,75],use:[42],repeat:[42,75],mode:'close',speed:2},
    {ids:[4,29,63,90],use:[29,63],repeat:[63,90],mode:'raise',speed:2},
    {ids:[105,114],use:[114],repeat:[105,114],mode:'raise',speed:8},
    {ids:[16,76],use:[],repeat:[76],mode:'closeThenOpen',speed:2},
  ];
  for(const g of groups)for(const special of g.ids){
    clean();const m=dividedMap(),s=m.sectors[1];s.tag=7;
    const closing=g.mode.startsWith('close');s.ceilingHeight=closing?64:0;
    const line={...m.linedefs[0],special,tag:7};
    const activate=()=>g.use.includes(special)?useSpecialLine(line,m):crossSpecialLine(line,m);
    activate();assert.equal(line.special,g.repeat.includes(special)?special:0,`consume ${special}`);
    runThinkers();assert.equal(s.ceilingHeight,closing?64-g.speed:g.speed,`speed ${special}`);
    if(g.repeat.includes(special)){activate();assert.equal(archiveThinkers().length,1,`busy retrigger ${special}`);}
    const dest=closing?0:124;
    ticks(Math.floor((closing?64:124)/g.speed));assert.equal(s.ceilingHeight,dest,`endpoint ${special}`);
    if(g.mode==='raise'||g.mode==='closeThenOpen'){
      const wait=g.mode==='raise'?150:1050;
      assert.equal(state().direction,0);assert.equal(state().topCountdown,wait);
      ticks(wait);assert.equal(s.ceilingHeight,dest);runThinkers();
      assert.equal(s.ceilingHeight,g.mode==='raise'?124-g.speed:g.speed);
      ticks(100);assert.equal(s.ceilingHeight,g.mode==='raise'?0:64);
    }
    assert.equal(archiveThinkers().length,0,`finished ${special}`);assert.equal(busySectors.size,0);
  }clean();
});
test('normal and fast lift triggers descend, wait three seconds, return and can retrigger',()=>{
  for(const [special,use,repeat,speed] of [[10,false,false,4],[21,true,false,4],[62,true,true,4],[88,false,true,4],[120,false,true,8],[123,true,true,8]] as const){
    clean();const m=dividedMap(),s=m.sectors[1];s.tag=7;s.floorHeight=32;
    const line={...m.linedefs[0],special,tag:7};
    const activate=()=>use?useSpecialLine(line,m):crossSpecialLine(line,m);
    activate();assert.equal(line.special,repeat?special:0);
    runThinkers();assert.equal(s.floorHeight,32-speed);ticks(32/speed);
    assert.equal(s.floorHeight,0);assert.equal(state().status,'waiting');assert.equal(state().count,105);
    ticks(105);assert.equal(s.floorHeight,0);runThinkers();assert.equal(s.floorHeight,speed);
    ticks(32/speed);assert.equal(s.floorHeight,32);assert.equal(archiveThinkers().length,0);assert.equal(busySectors.size,0);
    if(repeat){activate();runThinkers();assert.equal(s.floorHeight,32-speed);}
  }clean();
});
test('IWAD crusher triggers reach eight units, reverse, stop and resume without duplicate thinkers',()=>{
  for(const [special,speed,repeat] of [[25,1,false],[73,1,true],[77,2,true]] as const){
    clean();const m=dividedMap(),s=m.sectors[1];s.tag=7;s.ceilingHeight=32;
    const line={...m.linedefs[0],special,tag:7};crossSpecialLine(line,m);
    assert.equal(line.special,repeat?special:0);ticks(24/speed+1);
    assert.equal(s.ceilingHeight,8);assert.equal(state().direction,1);
    runThinkers();assert.equal(s.ceilingHeight,8+speed);
    crossSpecialLine({...line,special:74},m);ticks(20);assert.equal(s.ceilingHeight,8+speed);
    crossSpecialLine({...line,special:73},m);assert.equal(archiveThinkers().length,1);
    runThinkers();assert.equal(s.ceilingHeight,8+2*speed);
    ticks(24/speed);assert.equal(state().direction,-1);
  }clean();
});
test('normal and turbo stair switches finish increasing steps and respect texture boundaries',()=>{
  for(const [special,use,height,speed] of [[7,true,8,.25],[8,false,8,.25],[127,true,16,4]] as const){
    for(const matching of [true,false]){
      clean();const m=dividedMap();m.sectors[0].tag=7;
      if(!matching)m.sectors[1].floorTex='DIFFERENT';
      const line={...m.linedefs[0],special,tag:7};
      if(use)useSpecialLine(line,m);else crossSpecialLine(line,m);
      assert.equal(line.special,0);runThinkers();assert.equal(m.sectors[0].floorHeight,speed);
      ticks(height*2/speed);assert.equal(m.sectors[0].floorHeight,height);
      assert.equal(m.sectors[1].floorHeight,matching?height*2:0);assert.equal(busySectors.size,0);
    }
  }clean();
});

test('IWAD floor trigger families finish at authored neighbor heights and consume or retain triggers',()=>{
  const groups=[
    {ids:[19,45,83,102],use:[45,102],repeat:[45,83],start:64,neighbor:16,dest:16,speed:1},
    {ids:[23,38,60,82],use:[23,60],repeat:[60,82],start:64,neighbor:16,dest:16,speed:1},
    {ids:[36,70,71,98],use:[70,71],repeat:[70,98],start:64,neighbor:16,dest:24,speed:4},
    {ids:[18],use:[18],repeat:[],start:0,neighbor:32,dest:32,speed:1},
    {ids:[5,91,101],use:[101],repeat:[91],start:0,neighbor:0,dest:128,speed:1},
    {ids:[56,65],use:[65],repeat:[65],start:0,neighbor:0,dest:120,speed:1},
    {ids:[58,59],use:[],repeat:[],start:0,neighbor:0,dest:24,speed:1},
    {ids:[37],use:[],repeat:[],start:64,neighbor:16,dest:16,speed:1},
  ];
  for(const g of groups)for(const special of g.ids){
    clean();const m=dividedMap(),s=m.sectors[1];s.tag=7;s.floorHeight=g.start;
    m.sectors[0].floorHeight=g.neighbor;m.sectors[0].floorTex='MODEL';m.sectors[0].special=5;
    const line={...m.linedefs[0],special,tag:7};
    if(g.use.includes(special))useSpecialLine(line,m);else crossSpecialLine(line,m);
    assert.equal(line.special,g.repeat.includes(special)?special:0,`trigger ${special}`);
    if(special===59){assert.equal(s.floorTex,'MODEL');assert.equal(s.special,5);}
    if(special===37)assert.notEqual(s.floorTex,'MODEL');
    runThinkers();assert.equal(s.floorHeight,g.start+Math.sign(g.dest-g.start)*g.speed,`speed ${special}`);
    ticks(Math.abs(g.dest-g.start)/g.speed+1);
    assert.equal(s.floorHeight,g.dest,`destination ${special}`);assert.equal(busySectors.size,0);
    if(special===37){assert.equal(s.floorTex,'MODEL');assert.equal(s.special,5);}
  }clean();
});
