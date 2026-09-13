import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.env.DOOM_SOURCE??'/Users/sambide/GitHub/reference-material/DOOM/linuxdoom-1.10';
const source=readFileSync(root+'/g_game.c','utf8');
const start=source.indexOf('void G_ReadDemoTiccmd (ticcmd_t* cmd)'),open=source.indexOf('{',start);let end=open+1,depth=1;
for(;depth;end++)depth+=(source[end]==='{')-(source[end]==='}');
const body=source.slice(start,end),inputs=[[0,0,0,0],[50,216,255,3],[231,24,128,60],[127,129,127,1],[128,0,0,0]];
const dir=mkdtempSync(join(tmpdir(),'doom-demo-'));
try{
 const header='#include <stdio.h>\n#include <stdint.h>\n#define DEMOMARKER 128\ntypedef struct {int8_t forwardmove,sidemove;int16_t angleturn;uint8_t buttons;} ticcmd_t;\nstatic unsigned char* demo_p;static int ended;static void G_CheckDemoStatus(void){ended=1;}\n';
 const main=inputs.map(bytes=>`{unsigned char bytes[]={${bytes}};demo_p=bytes;ended=0;ticcmd_t cmd={0};G_ReadDemoTiccmd(&cmd);printf("%d %d %d %d %d\\n",cmd.forwardmove,cmd.sidemove,cmd.angleturn,cmd.buttons,ended);}`).join('\n');
 writeFileSync(join(dir,'oracle.c'),header+body+'\nint main(void){'+main+'}\n');execFileSync('cc',['-std=c99',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 const rows=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'}).trim().split('\n').map(line=>line.split(' ').map(Number));
 writeFileSync('tests/fixtures/demo-reference.json',JSON.stringify({function:'G_ReadDemoTiccmd',sourceSha256:createHash('sha256').update(source).digest('hex'),scope:'Command byte decoding and end marker only; no original world simulation.',cases:inputs.map((input,i)=>({input,expected:rows[i]}))},null,2)+'\n');
}finally{rmSync(dir,{recursive:true,force:true});}
