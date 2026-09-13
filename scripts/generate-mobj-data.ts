import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as existing from '../src/game/MobjData';
const root=process.env.DOOM_SOURCE ?? '/Users/sambide/GitHub/reference-material/DOOM/linuxdoom-1.10';
const source=readFileSync(root+'/info.c','utf8');
const states:Record<string,existing.MobjState>={},types:Record<string,existing.MobjInfo>={};
for(const m of source.matchAll(/\{SPR_(\w+),(\d+),(-?\d+),\{(\w+)\},(S_\w+),0,0\},?\s*\/\/\s*(S_\w+)/g))states[m[6]]={sprite:m[1],frame:Number(m[2])&32767,bright:!!(Number(m[2])&32768),tics:Number(m[3]),action:m[4]==='NULL'?null:m[4],next:m[5]};
const number=(value:string):number=>value.split('|').reduce((result,term)=>result|term.split('*').reduce((product,part)=>{
  const token=part.trim();const value=token==='FRACUNIT'?65536:token.startsWith('MF_')?(existing as Record<string,unknown>)[token]:Number(token);
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Unknown source value: '+token);return product*value;
},1),0);
const state=(value:string)=>value==='0'||value==='S_NULL'?null:value;
const sound=(value:string)=>value==='0'||value==='sfx_None'?null:value.replace(/^sfx_/,'');
for(const match of source.matchAll(/\{\s*\/\/\s*(MT_\w+)\s*\n([\s\S]*?)\n\s*\},?/g)){
  const f=Object.fromEntries([...match[2].matchAll(/^\s*([^/\n]+?)\s*,?\s*\/\/\s*(\w+)/gm)].map(m=>[m[2],m[1].replace(/,\s*$/,'').trim()]));
  types[match[1]]={doomedNum:number(f.doomednum),spawnState:f.spawnstate,spawnHealth:number(f.spawnhealth),seeState:state(f.seestate),painState:state(f.painstate),painChance:number(f.painchance),meleeState:state(f.meleestate),missileState:state(f.missilestate),deathState:state(f.deathstate)??'S_NULL',xDeathState:state(f.xdeathstate),raiseState:state(f.raisestate),seeSound:sound(f.seesound),attackSound:sound(f.attacksound),painSound:sound(f.painsound),deathSound:sound(f.deathsound),activeSound:sound(f.activesound),speed:number(f.speed),radius:number(f.radius),height:number(f.height),mass:number(f.mass),damage:number(f.damage),flags:number(f.flags)};
}
if(Object.keys(states).length!==967)throw new Error('Unexpected state count');
if(Object.keys(types).length!==137)throw new Error('Unexpected actor count: '+Object.keys(types).length);
const table=(data:object)=>'{\n'+Object.entries(data).map(([key,value])=>'  '+JSON.stringify(key)+': '+JSON.stringify(value)+',').join('\n')+'\n}';
writeFileSync('src/game/SourceMobjData.ts',`// Generated from original info.c by scripts/generate-mobj-data.ts.\n// SHA-256: ${createHash('sha256').update(source).digest('hex')}\n// Includes Doom II data; only Ultimate Doom single-player behavior is the current target.\nimport type {MobjInfo,MobjState} from './MobjData';\nexport const SOURCE_STATES:Record<string,MobjState> = ${table(states)};\nexport const SOURCE_TYPES:Record<string,MobjInfo> = ${table(types)};\n`);
console.log(`Generated ${Object.keys(states).length} states and ${Object.keys(types).length} actor definitions.`);
