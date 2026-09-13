import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=process.env.DOOM_SOURCE ?? '/Users/sambide/GitHub/reference-material/DOOM/linuxdoom-1.10';
const source=readFileSync(root+'/sounds.c','utf8');
const body=source.slice(source.indexOf('sfxinfo_t S_sfx[]'));
const data={};for(const m of body.matchAll(/\{\s*"(\w+)"\s*,\s*(true|false)\s*,\s*(\d+)\s*,\s*(0|&S_sfx\[sfx_(\w+)\])\s*,\s*(-?\d+)\s*,\s*(-?\d+)/g))data[m[1]]={priority:Number(m[3]),link:m[5]??null,pitch:Number(m[6]),volume:Number(m[7])};
if(Object.keys(data).length!==109)throw new Error('Unexpected sound count: '+Object.keys(data).length);
writeFileSync('src/sound/SourceSounds.ts',`// Generated from sounds.c by scripts/generate-sound-data.mjs.\n// SHA-256: ${createHash('sha256').update(source).digest('hex')}\nexport const SOURCE_SOUNDS:Record<string,{priority:number;link:string|null;pitch:number;volume:number}> = ${JSON.stringify(data,null,2)};\n`);
