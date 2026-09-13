import test from 'node:test';
import assert from 'node:assert/strict';
import {soundParameters,stereoGains} from '../src/sound/SoundParameters';
import {initSoundManager,playSound,playSoundAt,stopAllSounds,updateListener} from '../src/sound/SoundManager';
import {parseSounds} from '../src/sound/SoundParser';
import {SOURCE_SOUNDS} from '../src/sound/SourceSounds';
const F=65536;
test('sound attenuation is horizontal, has a 160-unit close range and map-eight floor',()=>{
  const listener={x:0,y:0,angle:0};
  assert.equal(soundParameters(listener,{x:159*F,y:0},1).volume,127);
  assert.equal(soundParameters(listener,{x:680*F,y:0},1).volume,63);
  assert.equal(soundParameters(listener,{x:1200*F,y:0},1).volume,0);
  assert.equal(soundParameters(listener,{x:4000*F,y:0},8).volume,15);
  assert.equal(soundParameters(listener,{x:0,y:200*F},1).separation,33);
  assert.equal(soundParameters(listener,{x:0,y:-200*F},1).separation,224);
  const centered=stereoGains(127,128);assert(centered.left>0.7&&centered.left<0.8);
});
function context(){
  const sources:any[]=[],gains:any[]=[];let resumes=0;
  const node=()=>({disconnected:false,connect(){},disconnect(){this.disconnected=true;}});
  const ctx={state:'suspended',destination:{},resume(){resumes++;return Promise.resolve();},
    createGain(){const n={...node(),gain:{value:1}};gains.push(n);return n;},
    createChannelMerger(){return node();},
    createBufferSource(){const n={...node(),buffer:null,playbackRate:{value:1},onended:null as any,stopped:false,start(){},stop(){this.stopped=true;}};sources.push(n);return n;}};
  return {ctx:ctx as unknown as AudioContext,sources,gains,resumes:()=>resumes};
}
test('effects obey channel priority, follow actor origins, clean up and cannot resume a paused context',()=>{
  const fake=context();initSoundManager(fake.ctx,{pistol:{} as AudioBuffer,stnmov:{} as AudioBuffer});updateListener({x:0,y:0,angle:0},1);
  const actor={x:100*F,y:0,z:900*F};playSoundAt('pistol',actor.x,actor.y,actor.z,actor);
  const first=fake.sources[0];assert.equal(first.stopped,false);assert.equal(fake.resumes(),0);
  playSoundAt('pistol',actor.x,actor.y,actor.z,actor);assert.equal(first.stopped,true);assert.equal(first.disconnected,true);
  actor.x=2000*F;updateListener({x:0,y:0,angle:0},1);assert.equal(fake.sources[1].stopped,true);
  for(let i=0;i<8;i++)playSoundAt('pistol',0,0,0,{});const count=fake.sources.length;
  playSoundAt('stnmov',0,0,0,{});assert.equal(fake.sources.length,count);
  playSoundAt('pistol',0,0,0,{});assert.equal(fake.sources[count-8].stopped,true);
  stopAllSounds();assert(fake.sources.every(source=>source.stopped&&source.disconnected));
  playSound('pistol');const source=fake.sources.at(-1);source.onended();assert.equal(source.disconnected,true);
});
test('source sound inventory loads previously omitted effects and linked aliases',async()=>{
  assert.equal(Object.keys(SOURCE_SOUNDS).length,109);
  const buffer=new ArrayBuffer(24),view=new DataView(buffer),buf=new Uint8Array(buffer);
  for(const offset of [0,12]){view.setUint16(offset,3,true);view.setUint16(offset+2,11025,true);view.setUint32(offset+4,4,true);buf.set([0,128,192,255],offset+8);}
  const lumps=['DSPISTOL','DSSGCOCK'].map((name,index)=>({name,index,filepos:index*12,size:12}));
  const wad={magic:'IWAD',lumps,lumpMap:Object.fromEntries(lumps.map(l=>[l.name,l])),buffer,view,buf};
  const audio={createBuffer(_channels:number,length:number){const data=new Float32Array(length);return {getChannelData:()=>data};}} as unknown as AudioContext;
  const sounds=await parseSounds(wad,audio);assert(sounds.sgcock);assert(sounds.chgun);
  assert.deepEqual(sounds.chgun.getChannelData(0),sounds.pistol.getChannelData(0));
});
test('floor movement sounds use global level tics and stop at the destination',async()=>{
  const {setSectorTicSource}=await import('../src/game/SectorHelpers');
  const {evDoFloor,resetFloors}=await import('../src/game/Floors');
  const {resetThinkers,runThinkers}=await import('../src/game/Thinkers');
  const {dividedMap}=await import('./fixtures/maps');
  const fake=context(),moving={} as AudioBuffer,stopping={} as AudioBuffer;
  initSoundManager(fake.ctx,{stnmov:moving,pstop:stopping});updateListener({x:0,y:0,angle:0},1);
  resetThinkers();resetFloors();const map=dividedMap();map.sectors[0].tag=7;
  let tic=7;setSectorTicSource(()=>tic);evDoFloor('raiseFloor24',7,map.linedefs,map.sidedefs,map.sectors);
  runThinkers();assert.equal(fake.sources.length,0);
  for(tic=8;tic<=31;tic++)runThinkers();
  assert.deepEqual(fake.sources.map(source=>source.buffer),[moving,moving,moving,stopping]);
  assert.equal(map.sectors[0].floorHeight,24);stopAllSounds();resetThinkers();resetFloors();setSectorTicSource(()=>0);
});
test('sound distance and separation match executed S_AdjustSoundParams C cases',async()=>{
  const {readFileSync}=await import('node:fs');
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/sound-reference.json',import.meta.url),'utf8'));
  for(const {input,expected} of fixture.cases)assert.deepEqual(soundParameters({x:0,y:0,angle:input.angle},input,input.map),expected,JSON.stringify(input));
});

test('near and distant teleports start destination audio before the next listener frame',async()=>{
  const {Group}=await import('three');
  const {dividedMap}=await import('./fixtures/maps');
  const {initMobjSystem,allMobjs}=await import('../src/game/Mobj');
  const {createPlayer}=await import('../src/physics/DoomMovement');
  const {resetThinkers}=await import('../src/game/Thinkers');
  const {evTeleport,consumeTeleport}=await import('../src/game/Teleport');
  const fake=context();initSoundManager(fake.ctx,{telept:{} as AudioBuffer});
  for(const startX of [60,4000]){
    stopAllSounds();resetThinkers();allMobjs.length=0;
    const map=dividedMap();map.sectors[1].tag=7;
    initMobjSystem({},new Group(),map);
    const player=createPlayer(startX,0,0);updateListener(player.mo,1);
    const first=fake.sources.length;
    assert.equal(evTeleport({...map.linedefs[0],tag:7},0,player,map,[{type:14,x:-60,y:0,angle:90,flags:7}]),true);
    assert.equal(fake.sources.length-first,startX===60?2:1);
    updateListener(player.mo,1);
    assert.equal(fake.sources.at(-1).stopped,false,'destination effect survives listener update');
    assert(fake.gains.at(-1).gain.value>0.7,'destination remains audible at close range');
    consumeTeleport();
  }
  stopAllSounds();resetThinkers();allMobjs.length=0;
});
