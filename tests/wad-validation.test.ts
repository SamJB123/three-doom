import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWAD,getLump} from '../src/wad/WADParser';
import {parseVertexes} from '../src/wad/MapParser';
import {parsePatch,parseTextures} from '../src/wad/TextureParser';
import {parseBlockmap} from '../src/wad/BlockmapParser';
import {validateMap} from '../src/wad/MapValidation';
import {dividedMap} from './fixtures/maps';
function wad(lumps:[string,Uint8Array][]){
  const directory=12+lumps.reduce((sum,[,data])=>sum+data.length,0),buffer=new ArrayBuffer(directory+lumps.length*16),bytes=new Uint8Array(buffer),view=new DataView(buffer);
  bytes.set(new TextEncoder().encode('PWAD'));view.setInt32(4,lumps.length,true);view.setInt32(8,directory,true);let offset=12;
  lumps.forEach(([name,data],i)=>{bytes.set(data,offset);view.setInt32(directory+i*16,offset,true);view.setInt32(directory+i*16+4,data.length,true);bytes.set(new TextEncoder().encode(name),directory+i*16+8);offset+=data.length;});return parseWAD(buffer);
}
function patch(color:number){const data=new Uint8Array(18),v=new DataView(data.buffer);v.setInt16(0,1,true);v.setInt16(2,1,true);v.setUint32(8,12,true);data.set([0,1,0,color,0,255],12);return data;}
function texture(){const data=new Uint8Array(40),v=new DataView(data.buffer);v.setInt32(0,1,true);v.setInt32(4,8,true);data.set(new TextEncoder().encode('ONE'),8);v.setInt16(20,1,true);v.setInt16(22,1,true);v.setInt16(28,1,true);return data;}
function pnames(){const data=new Uint8Array(12);new DataView(data.buffer).setInt32(0,1,true);data.set(new TextEncoder().encode('PATCH'),4);return data;}

test('map records and patch posts cannot read through into the following lump',()=>{
  const map=wad([['VERTEXES',new Uint8Array(5)],['PADDING',new Uint8Array(40)]]);
  assert.throws(()=>parseVertexes(map,getLump(map,'VERTEXES')!),/record bounds/);
  for(const broken of [patch(1).subarray(0,17),patch(1).subarray(0,15),patch(1).subarray(0,7)]){
    const w=wad([['PATCH',broken],['PADDING',new Uint8Array(100)]]);assert.throws(()=>parsePatch(w,getLump(w,'PATCH')!.offset),/patch/);
  }
  const bad=patch(1);new DataView(bad.buffer).setUint32(8,100,true);const w=wad([['PATCH',bad],['PAD',new Uint8Array(120)]]);
  assert.throws(()=>parsePatch(w,getLump(w,'PATCH')!.offset),/column offset/);
});
test('texture patch lookup honors later overrides even outside patch namespace markers',()=>{
  const w=wad([['PNAMES',pnames()],['TEXTURE1',texture()],['P_START',new Uint8Array()],['PATCH',patch(1)],['P_END',new Uint8Array()],['PATCH',patch(2)]]);
  const result=parseTextures(w,new Uint8Array(768));assert.equal(result.ONE.indices[0],2);assert.equal(result.ONE.rgba[3],255);
  const invalid=texture();new DataView(invalid.buffer).setInt16(28,2,true);
  assert.throws(()=>parseTextures(wad([['PNAMES',pnames()],['TEXTURE1',invalid],['PATCH',patch(1)]]),new Uint8Array(768)),/texture definition/);
});
test('BLOCKMAP validates dimensions, offsets and list termination within its own lump',()=>{
  const data=new Uint8Array(16),view=new DataView(data.buffer);view.setUint16(4,1,true);view.setUint16(6,1,true);view.setUint16(8,5,true);view.setUint16(12,0,true);view.setUint16(14,65535,true);
  const valid=wad([['BLOCKMAP',data]]);assert.deepEqual(parseBlockmap(valid,getLump(valid,'BLOCKMAP')!).lists,[[0]]);
  for(const broken of [data.subarray(0,14),new Uint8Array(6)]){const w=wad([['BLOCKMAP',broken],['PAD',new Uint8Array(100)]]);assert.throws(()=>parseBlockmap(w,getLump(w,'BLOCKMAP')!),/BLOCKMAP/);}
  view.setUint16(4,65535,true);const w=wad([['BLOCKMAP',data]]);assert.throws(()=>parseBlockmap(w,getLump(w,'BLOCKMAP')!),/dimensions/);
});
test('map setup rejects invalid geometry links, subsector ranges and BSP cycles',()=>{
  validateMap(dividedMap());
  for(const mutate of [
    (m:ReturnType<typeof dividedMap>)=>{m.linedefs[0].right=99;},
    (m:ReturnType<typeof dividedMap>)=>{m.sidedefs[0].sector=99;},
    (m:ReturnType<typeof dividedMap>)=>{m.subsectors[0].numSegs=99;},
    (m:ReturnType<typeof dividedMap>)=>{m.nodes[0].rightChild=0;},
    (m:ReturnType<typeof dividedMap>)=>{m.blockmap.lists[0]=[99];},
    (m:ReturnType<typeof dividedMap>)=>{m.reject=new Uint8Array();}
  ]){const m=dividedMap();mutate(m);assert.throws(()=>validateMap(m),/Invalid map/);}
});
