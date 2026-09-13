// Original S_AdjustSoundParams with original angle routines/tables.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.env.DOOM_SOURCE ?? '/Users/sambide/GitHub/reference-material/DOOM/linuxdoom-1.10';
const source=readFileSync(root+'/s_sound.c','utf8'),render=readFileSync(root+'/r_main.c','utf8'),tables=readFileSync(root+'/tables.c','utf8');
function extract(text,name){const match=[...text.matchAll(new RegExp('(int|angle_t)\\n'+name+'\\n','g'))].find(m=>!text.slice(m.index,text.indexOf('{',m.index)).includes(';'));if(!match)throw new Error(name);const open=text.indexOf('{',match.index);let depth=1,end=open+1;for(;depth;end++){if(text[end]==='{')depth++;if(text[end]==='}')depth--;}return text.slice(match.index,end);}
const cases=[...[[100,0],[160,0],[680,0],[1200,0],[1300,0],[400,400],[0,200],[0,-200]].map(([x,y])=>({x:x*65536,y:y*65536,angle:0,map:1})),{x:4000*65536,y:0,angle:0,map:8},{x:200*65536,y:0,angle:0x40000000,map:1}];
const dir=mkdtempSync(join(tmpdir(),'doom-sound-'));
try{
 const header=`#include <stdio.h>\n#include <stdlib.h>\n#include <stdint.h>\ntypedef int32_t fixed_t;typedef uint32_t angle_t;typedef struct {fixed_t x,y;angle_t angle;} mobj_t;\n#define FRACUNIT 65536\n#define FRACBITS 16\n#define ANG90 0x40000000u\n#define ANG180 0x80000000u\n#define ANG270 0xc0000000u\n#define ANGLETOFINESHIFT 19\n#define SLOPERANGE 2048\n#define S_CLIPPING_DIST (1200*FRACUNIT)\n#define S_CLOSE_DIST (160*FRACUNIT)\n#define S_ATTENUATOR 1040\n#define S_STEREO_SWING (96*FRACUNIT)\nstatic fixed_t viewx,viewy;static int snd_SfxVolume=127,gamemap;\nstatic fixed_t FixedMul(fixed_t a,fixed_t b){return (fixed_t)(((int64_t)a*b)>>16);}\n`;
 const funcs=extract(render,'R_PointToAngle')+'\n'+extract(render,'R_PointToAngle2')+'\n'+extract(source,'S_AdjustSoundParams');
 const main=cases.map(c=>`listener.angle=${c.angle}u;origin.x=${c.x};origin.y=${c.y};gamemap=${c.map};vol=127;sep=128;pitch=128;audible=S_AdjustSoundParams(&listener,&origin,&vol,&sep,&pitch);printf("%d %d\\n",audible?vol:0,sep);`).join('\n');
 writeFileSync(join(dir,'oracle.c'),header+tables.replace('#include "tables.h"','')+funcs+'\nint main(void){mobj_t listener={0},origin={0};int vol,sep,pitch,audible;\n'+main+'\n}\n');
 execFileSync('cc',['-std=c99',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 const rows=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'}).trim().split('\n').map(row=>row.split(' ').map(Number));
 writeFileSync('tests/fixtures/sound-reference.json',JSON.stringify({function:'S_AdjustSoundParams',sourceSha256:createHash('sha256').update(source).digest('hex'),renderSha256:createHash('sha256').update(render).digest('hex'),tablesSha256:createHash('sha256').update(tables).digest('hex'),scope:'Volume 127; inaudible results normalized to volume 0. No mixer/resampler or channel allocation comparison.',cases:cases.map((input,i)=>({input,expected:{volume:rows[i][0],separation:rows[i][1]}}))},null,2)+'\n');
}finally{rmSync(dir,{recursive:true,force:true});}
