import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {dividedMap} from './fixtures/maps';
import {createPlayer} from '../src/physics/DoomMovement';
import {initMobjSystem,allMobjs,resetMobjs} from '../src/game/Mobj';
import {archiveWorld} from '../src/game/WorldArchive';
import {resetThinkers} from '../src/game/Thinkers';
import {resetUseActions} from '../src/game/UseAction';
import {initEnemyAI} from '../src/game/EnemyAI';
import {WeaponSystem} from '../src/game/Weapons';
import {createPlayerStatus} from '../src/ecs/traits';
import {decodeSave,type SaveGame} from '../src/game/SaveGame';
function fixture():SaveGame {
  resetThinkers();resetMobjs();resetUseActions();initEnemyAI();
  const map=dividedMap();initMobjSystem({},new Group(),map);const body=createPlayer(60,0,0);allMobjs.push(body.mo);
  return {format:'three-doom',version:2,wad:'test',label:'Save',savedAt:'2026-09-13',episode:1,map:1,skill:3,tic:0,
    world:archiveWorld(map,body),player:createPlayerStatus(),weapons:new WeaponSystem().archive(),sprites:{fraction:0,sprites:[]},
    automap:{nextMark:0,seen:[],zoom:.25,follow:true,center:{x:0,y:0},marks:[]},view:{yaw:0,pitch:0},stats:{kills:0,items:0,secrets:0}};
}
test('save decoder accepts current and legacy optional fields, rejects invalid runtime state before restoration',()=>{
  const save=fixture();assert.deepEqual(decodeSave(JSON.stringify(save),'test'),save);
  const old:any=structuredClone(save);old.version=1;delete old.weapons.extraLight;delete old.automap.nextMark;delete old.world.thingLinkSequence;
  assert.equal(decodeSave(JSON.stringify(old),'test').version,1);
  const edits:((s:any)=>void)[]=[s=>s.player.godMode='false',s=>s.player.noClip=1,s=>s.player.didSecret=null,
    s=>s.player.mobjState.name='MISSING',s=>s.weapons.psprites[0].state='MISSING',s=>s.weapons.psprites[0].state='constructor',
    s=>s.world.player.viewz=null,s=>s.world.player.running='false',s=>s.weapons.attackDown=1,s=>s.weapons.refire=-1,
    s=>s.world.use.useDown='false',s=>s.world.ai.tic=null,s=>s.automap.follow='false',s=>s.automap.zoom=0,
    s=>s.automap.marks=Array(11).fill({x:0,y:0}),s=>s.sprites.sprites={},s=>s.world.actors=[null],s=>s.world.thinkers=[null]];
  for(const edit of edits){const bad=structuredClone(save);edit(bad);assert.throws(()=>decodeSave(JSON.stringify(bad),'test'),/damaged or incompatible/);}
  assert.throws(()=>decodeSave(JSON.stringify(save),'other'),/different WAD/);
  resetThinkers();resetMobjs();
});
test('save decoder rejects invalid special types, movement directions and crush flags',()=>{
  const save=fixture();
  for(const [kind,type] of [['door','normal'],['floor','raiseFloor24'],['platform','downWaitUpStay'],['ceiling','crushAndRaise'],['light','glow']]){
    const data={sectorIdx:0,type,topHeight:128,speed:1,direction:1,topWait:150,topCountdown:0,destHeight:24,crush:false,
      low:0,high:32,wait:105,count:0,status:'up',bottomHeight:8,tag:7,oldDirection:-1,min:80,max:160,dark:35};
    save.world.thinkers=[{kind,data}];assert.doesNotThrow(()=>decodeSave(JSON.stringify(save),'test'),kind);
    for(const bad of [{type:'missing'},...(['door','floor','ceiling'].includes(kind)?[{direction:8}]:[]),...(['floor','platform','ceiling'].includes(kind)?[{crush:'false'}]:[])]){
      save.world.thinkers=[{kind,data:{...data,...bad}}];assert.throws(()=>decodeSave(JSON.stringify(save),'test'),/damaged or incompatible/,kind);
    }
  }
  resetThinkers();resetMobjs();
});
