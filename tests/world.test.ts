import test from 'node:test';
import assert from 'node:assert/strict';
import { addThinker, removeThinker, resetThinkers, runThinkers } from '../src/game/Thinkers';
import { spawnLightSpecials } from '../src/game/Lights';
import { clearRandom, P_Random } from '../src/game/DoomRandom';
import { dividedMap } from './fixtures/maps';
import { parseWAD, getLump } from '../src/wad/WADParser';
import { nextMap, mapMusic } from '../src/game/Campaign';

test('P_RunThinkers insertion order, lazy removal and same-tic appended actions',()=>{
  resetThinkers();
  const trace: string[]=[];
  const second=()=>{trace.push('removed');return true;};
  addThinker(()=>{trace.push('first');removeThinker(second);addThinker(()=>{trace.push('new');return false;});return false;});
  addThinker(second);
  addThinker(()=>{trace.push('third');return false;});
  runThinkers();runThinkers();
  assert.deepEqual(trace,['first','third','new']);
});

test('broken lights use P_Random flash timing, distinct from fire flicker',()=>{
  resetThinkers();clearRandom();const m=dividedMap();
  m.sectors[0].special=1;m.sectors[1].lightLevel=80;
  spawnLightSpecials(m.sectors,m.linedefs,m.sidedefs);
  assert.equal(m.sectors[0].special,0);
  runThinkers();assert.equal(m.sectors[0].lightLevel,80); // (8 & 64)+1 = 1
  for(let i=0;i<5;i++) runThinkers();
  assert.equal(m.sectors[0].lightLevel,80); // (109 & 7)+1 = 6
  runThinkers();assert.equal(m.sectors[0].lightLevel,160);
  assert.equal(P_Random(),222); // exactly three random bytes consumed by lights
});

test('glow reverses without overshooting and damaging strobes retain special 4',()=>{
  resetThinkers();clearRandom();const m=dividedMap();
  m.sectors[0].special=8;m.sectors[1].lightLevel=152;
  spawnLightSpecials(m.sectors,m.linedefs,m.sidedefs);
  runThinkers();assert.equal(m.sectors[0].lightLevel,160);
  runThinkers();assert.equal(m.sectors[0].lightLevel,160);
  resetThinkers();m.sectors[0].special=4;
  spawnLightSpecials(m.sectors,m.linedefs,m.sidedefs);
  assert.equal(m.sectors[0].special,4);
});

function wad(): ArrayBuffer {
  const data=new ArrayBuffer(46), bytes=new Uint8Array(data), view=new DataView(data);
  bytes.set(new TextEncoder().encode('PWAD'));
  view.setInt32(4,2,true);view.setInt32(8,14,true);
  for(let i=0;i<2;i++) {
    view.setInt32(14+i*16,12+i,true);view.setInt32(18+i*16,1,true);
    bytes.set(new TextEncoder().encode('TEST'),22+i*16);
  }
  return data;
}
test('WAD lookup follows original backward search and rejects truncated ranges',()=>{
  assert.equal(getLump(parseWAD(wad()),'test')!.offset,13);
  assert.throws(()=>parseWAD(new ArrayBuffer(8)),/header/);
  const bad=wad();new DataView(bad).setInt32(8,45,true);
  assert.throws(()=>parseWAD(bad),/directory/);
  const lump=wad();new DataView(lump).setInt32(18,100,true);
  assert.throws(()=>parseWAD(lump),/lump bounds/);
});
test('Ultimate Doom secret return routes and episode-four music',()=>{
  assert.deepEqual([1,2,3,4].map(ep=>nextMap(ep,9,false)),[4,6,7,3]);
  for(let ep=1;ep<=4;ep++) {assert.equal(nextMap(ep,8,false),null);assert.equal(nextMap(ep,2,true),9);}
  assert.equal(mapMusic(4,1),'D_E3M4');
});
