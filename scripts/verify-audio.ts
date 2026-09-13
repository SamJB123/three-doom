import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import OPL from '../src/vendor/opl3/opl3.js';
import MUS from '../src/vendor/opl3/mus.js';
import {parseWAD,getLump} from '../src/wad/index';
const bytes=readFileSync(process.env.DOOM_WAD??'public/doomu.wad');
const wad=parseWAD(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const lump=(name:string)=>{const l=getLump(wad,name)!;return wad.buf.slice(l.offset,l.offset+l.size).buffer;};
const tracks=['D_E1M1','D_INTER','D_VICTOR','D_BUNNY'];
function render(Chip:any,Format:any,name:string) {
  const random=Math.random;let seed=1;
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  try{
    const chip=new Chip(),player=new Format(chip,{instruments:lump('GENMIDI')});
    player.OPLshutup=function(){for(let i=0;i<this.OPL3CHANNELS;i++){this.OPLwriteChannel(0x80,i,15,15);this.OPLwriteChannel(0x40,i,63,63);this.OPLwriteValue(0xb0,i,0);}};
    player.load(new Uint8Array(lump(name)));
    const output=new Float32Array(49700*2);let frames=0;
    while(frames<49700){assert(player.update());const count=Math.min(49700-frames,Math.max(1,Math.floor(player.refresh()*49700)));const chunk=new Float32Array(count*2);chip.read(chunk);output.set(chunk,frames*2);frames+=count;}
    assert(output.some(v=>v!==0),'Expected non-silent PCM');assert(output.every(Number.isFinite));
    return createHash('sha256').update(new Uint8Array(output.buffer)).digest('hex');
  }finally{Math.random=random;}
}
const path='tests/fixtures/audio-reference.json';
if(process.argv.includes('--record-upstream')){
  const require=createRequire(import.meta.url),Chip=require('opl3/lib/opl3.js'),Format=require('opl3/format/mus.js');
  writeFileSync(path,JSON.stringify({source:'opl3@0.4.3 / wad-genmidi@0.1.0',seconds:1,rate:49700,wad:createHash('sha256').update(bytes).digest('hex'),tracks:Object.fromEntries(tracks.map(name=>[name,render(Chip,Format,name)]))},null,2)+'\n');
}
const expected=JSON.parse(readFileSync(path,'utf8'));
assert.equal(expected.wad,createHash('sha256').update(bytes).digest('hex'));
for(const name of tracks)assert.equal(render(OPL,MUS,name),expected.tracks[name],name);
console.log('PASS: browser OPL/MUS produces identical non-silent PCM for four upstream reference tracks.');
