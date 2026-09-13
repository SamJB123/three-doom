import {readFileSync} from 'node:fs';
import {MOBJ_STATES} from '../src/game/MobjData';
const source=readFileSync((process.env.DOOM_SOURCE ?? '/Users/sambide/GitHub/reference-material/DOOM/linuxdoom-1.10')+'/info.c','utf8');
const states=new Map<string,unknown>();
for(const m of source.matchAll(/\{SPR_(\w+),(\d+),(-?\d+),\{(\w+)\},(S_\w+),0,0\},?\s*\/\/\s*(S_\w+)/g))states.set(m[6],{sprite:m[1],frame:Number(m[2])&32767,bright:!!(Number(m[2])&32768),tics:Number(m[3]),action:m[4]==='NULL'?null:m[4],next:m[5]});
let mismatches=0;
for(const [name,state] of Object.entries(MOBJ_STATES)){const reference=states.get(name);if(reference && JSON.stringify(reference)!==JSON.stringify(state)){console.log(name,JSON.stringify(reference));mismatches++;}}
console.log({reference:states.size,ported:Object.keys(MOBJ_STATES).length,mismatches});
if(mismatches)process.exitCode=1;
import {MOBJ_TYPES,DOOMEDNUM_TO_TYPE} from '../src/game/MobjData';
import {parseWAD,getMapLumps,parseThings} from '../src/wad';
const data=readFileSync('public/doomu.wad');const wad=parseWAD(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
const used=new Set<number>();for(let e=1;e<=4;e++)for(let m=1;m<=9;m++)for(const thing of parseThings(wad,getMapLumps(wad,`E${e}M${m}`).THINGS))used.add(thing.type);
for(const match of source.matchAll(/\{\s*\/\/\s*(MT_\w+)\s*\n([\s\S]*?)\n\s*\},/g)){
  const fields=Object.fromEntries([...match[2].matchAll(/^\s*([^/\n]+?)\s*,?\s*\/\/\s*(\w+)/gm)].map(m=>[m[2],m[1].replace(/,\s*$/,'').trim()]));
  if(used.has(Number(fields.doomednum)) && !DOOMEDNUM_TO_TYPE[Number(fields.doomednum)])console.log('STATIC',match[1],fields.doomednum,fields.spawnstate,fields.flags,fields.radius,fields.height);
}
