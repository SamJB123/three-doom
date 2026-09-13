import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {dividedMap,sector} from './fixtures/maps';
import {resetThinkers,runThinkers,archiveThinkers} from '../src/game/Thinkers';
import {evDoFloor,evDoDonut,resetFloors,setFloorTextureHeights} from '../src/game/Floors';
import {evDoPlat,evStopPlat,resetPlatforms} from '../src/game/Platforms';
import {resetDoors} from '../src/game/Doors';
import {useSpecialLine,crossSpecialLine,shootSpecialLine,resetUseActions,updateButtons,archiveUseActions} from '../src/game/UseAction';
import {createPlayer} from '../src/physics/DoomMovement';
import {createPlayerStatus} from '../src/ecs/traits';
import {lineAttack,setAttackMap,initAttackSystem} from '../src/game/Attack';
import {initMobjSystem,resetMobjs,spawnMobj} from '../src/game/Mobj';
import {FRACUNIT as F} from '../src/math/fixed';
import {consumeTeleport} from '../src/game/Teleport';

function clean(){resetUseActions();resetThinkers();resetFloors();resetPlatforms();resetDoors();resetMobjs();}
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

test('projectiles cannot consume walk triggers or teleport, while monsters can open doors',async()=>{
  const {evTeleport}=await import('../src/game/Teleport');
  for(const type of ['MT_ROCKET','MT_PLASMA','MT_BFG','MT_TROOPSHOT','MT_HEADSHOT','MT_BRUISERSHOT'] as const){
    for(const special of [4,10,39,88,97,125,126]){
      clean();const m=dividedMap();m.sectors[1].tag=7;m.sectors[1].ceilingHeight=64;
      initMobjSystem({},new Group(),m);const missile=spawnMobj(60*F,0,32*F,type);
      const line={...m.linedefs[0],special,tag:7},things=[{type:14,x:-80,y:0,angle:90,flags:7}];
      const count=archiveThinkers().length;
      crossSpecialLine(line,m,undefined,things,0,missile);
      assert.equal(line.special,special,`${type} consumed ${special}`);
      assert.equal(archiveThinkers().length,count);assert.equal(missile.x,60*F);
      assert.equal(evTeleport(line,0,missile,m,things),false);
    }
  }
  clean();const m=dividedMap();m.sectors[1].tag=7;m.sectors[1].ceilingHeight=0;
  initMobjSystem({},new Group(),m);const monster=spawnMobj(60*F,0,0,'MT_TROOP');
  const line={...m.linedefs[0],special:4,tag:7};crossSpecialLine(line,m,undefined,[],0,monster);
  assert.equal(line.special,0);assert.equal(archiveThinkers().length,2);clean();
});

test('one-shot switches clear without artwork, and switch-list order chooses the texture',()=>{
  clean();const m=dividedMap(),line={...m.linedefs[0],special:24};
  m.sidedefs[0].middle='-';shootSpecialLine(line,m,true);assert.equal(line.special,0);
  m.sidedefs[0].upper='SW1WOOD';m.sidedefs[0].middle='SW1BRCOM';line.special=24;
  shootSpecialLine(line,m,true);assert.equal(m.sidedefs[0].upper,'SW1WOOD');assert.equal(m.sidedefs[0].middle,'SW2BRCOM');clean();
});
test('repeated gun buttons flip artwork without restarting their original 35-tic timer',()=>{
  clean();const m=dividedMap(),line={...m.linedefs[0],special:46};
  shootSpecialLine(line,m,true);assert.equal(m.sidedefs[0].middle,'SW2BRCOM');
  for(let i=0;i<10;i++)updateButtons(m.sidedefs);
  shootSpecialLine(line,m,true);assert.equal(m.sidedefs[0].middle,'SW1BRCOM');
  assert.equal(archiveUseActions(m.sidedefs).buttons[0].timer,25);
  shootSpecialLine(line,m,true);assert.equal(m.sidedefs[0].middle,'SW2BRCOM');
  for(let i=0;i<24;i++)updateButtons(m.sidedefs);
  assert.equal(m.sidedefs[0].middle,'SW2BRCOM');updateButtons(m.sidedefs);
  assert.equal(m.sidedefs[0].middle,'SW1BRCOM');assert.equal(archiveUseActions(m.sidedefs).buttons.length,0);clean();
});

test('light triggers honor one-shot/repeat rules and button texture changes',()=>{
  for(const [special,expected,repeat,use] of [[12,80,false,false],[79,35,true,false],[80,80,true,false],[81,255,true,false],[138,255,true,true],[139,35,true,true]] as const){
    clean();const m=dividedMap();m.sectors[0].tag=7;m.sectors[1].lightLevel=80;
    const line={...m.linedefs[0],special,tag:7};
    if(use)useSpecialLine(line,m);else crossSpecialLine(line,m);
    assert.equal(m.sectors[0].lightLevel,expected,`special ${special}`);
    assert.equal(line.special,repeat?special:0);
    if(use)assert.equal(m.sidedefs[0].middle,'SW2BRCOM');
  }clean();
});
test('walk-triggered slow strobes preserve source timing and skip moving sectors',async()=>{
  const {busySectors}=await import('../src/game/Thinkers');
  const {restoreRandom,archiveRandom}=await import('../src/game/DoomRandom');
  clean();const m=dividedMap();m.sectors[0].tag=7;m.sectors[0].special=8;m.sectors[1].lightLevel=80;
  const line={...m.linedefs[0],special:17,tag:7};restoreRandom({play:0,misc:0});
  busySectors.add(0);crossSpecialLine(line,m);assert.equal(archiveThinkers().length,0);assert.equal(line.special,0);
  busySectors.clear();line.special=17;crossSpecialLine(line,m);
  assert.equal(archiveRandom().play,1);assert.equal(m.sectors[0].special,0);
  const state=archiveThinkers()[0].data as any;assert.equal(state.dark,35);
  for(let i=0;i<state.count;i++)runThinkers();assert.equal(m.sectors[0].lightLevel,80);
  for(let i=0;i<35;i++)runThinkers();assert.equal(m.sectors[0].lightLevel,160);
  for(let i=0;i<5;i++)runThinkers();assert.equal(m.sectors[0].lightLevel,80);clean();
});
test('remaining floor and platform trigger variants start movers and retain repeatability',()=>{
  const cases=[
    [84,'floor','lowerAndChange',false,true],[92,'floor','raiseFloor24',false,true],
    [93,'floor','raiseFloor24AndChange',false,true],[94,'floor','raiseFloorCrush',false,true],
    [95,'platform','raiseToNearestAndChange',false,true],[96,'floor','raiseToTexture',false,true],
    [55,'floor','raiseFloorCrush',true,false],[131,'floor','raiseFloorTurbo',true,false],
    [132,'floor','raiseFloorTurbo',true,true],[140,'floor','raiseFloor512',true,false],
    [66,'platform','raiseAndChange',true,true],[67,'platform','raiseAndChange',true,true],[68,'platform','raiseToNearestAndChange',true,true]
  ] as const;
  for(const [special,kind,type,use,repeat] of cases){
    clean();const m=dividedMap();m.sectors[1].tag=7;m.sectors[0].floorHeight=32;
    const line={...m.linedefs[0],special,tag:7};
    if(use)useSpecialLine(line,m);else crossSpecialLine(line,m);
    const record=archiveThinkers().find(record=>record.kind===kind);
    assert(record,`special ${special} did not start ${kind}`);assert.equal((record.data as any).type,type);
    assert.equal(line.special,repeat?special:0);
    if(special===66||special===67)assert.equal((record.data as any).high,special===66?24:32);
  }clean();
});

test('all four light thinkers match 140 executed C tics including RNG consumption',async()=>{
  const {readFileSync}=await import('node:fs');
  const {restoreLights}=await import('../src/game/Lights');
  const {restoreRandom,archiveRandom}=await import('../src/game/DoomRandom');
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/lights-reference.json',import.meta.url),'utf8'));
  for(const {initial,rows} of fixture.cases){
    clean();const m=dividedMap();m.sectors[0].lightLevel=initial.max;restoreRandom({play:0,misc:0});
    const state={...initial};restoreLights(state,m.sectors);
    for(const [tic,expected] of rows.entries()){
      runThinkers();assert.deepEqual([m.sectors[0].lightLevel,state.count,state.direction,archiveRandom().play],expected,`${state.type} tic ${tic+1}`);
    }
  }clean();
});
