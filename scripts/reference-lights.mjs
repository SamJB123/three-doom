import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.env.DOOM_SOURCE??'/Users/sambide/GitHub/reference-material/DOOM/linuxdoom-1.10';
const source=readFileSync(root+'/p_lights.c','utf8'),random=readFileSync(root+'/m_random.c','utf8');
function extract(name){const start=source.indexOf('void '+name+'(')>=0?source.indexOf('void '+name+'('):source.indexOf('void '+name+' (');if(start<0)throw Error(name);const open=source.indexOf('{',start);let depth=1,end=open+1;for(;depth;end++){depth+=(source[end]==='{')-(source[end]==='}');}return source.slice(start,end);}
const table=random.match(/rndtable\[256\]\s*=\s*\{([\s\S]*?)\}/)[1];
const cases=[['fire','T_FireFlicker',4,96,160],['flash','T_LightFlash',1,80,160],['strobe','T_StrobeFlash',1,80,160],['glow','T_Glow',1,80,160]];
const dir=mkdtempSync(join(tmpdir(),'doom-lights-'));
try{
 const header=`#include <stdio.h>\n#define GLOWSPEED 8\ntypedef struct {int lightlevel;} sector_t;\ntypedef struct {sector_t* sector;int count,minlight,maxlight,mintime,maxtime,darktime,brighttime,direction;} light_t;\ntypedef light_t fireflicker_t;typedef light_t lightflash_t;typedef light_t strobe_t;typedef light_t glow_t;\nstatic int index=0;static int rndtable[256]={${table}};static int P_Random(void){index=(index+1)&255;return rndtable[index];}\n`;
 const main=cases.map(([,fn,count,min,max])=>`index=0;sector_t sector={${max}};light_t light={&sector,${count},${min},${max},7,64,35,5,-1};for(int tic=0;tic<140;tic++){${fn}(&light);printf("%d %d %d %d\\n",sector.lightlevel,light.count,light.direction,index);}`).map(s=>'{'+s+'}').join('\n');
 writeFileSync(join(dir,'oracle.c'),header+cases.map(([,fn])=>extract(fn)).join('\n')+'\nint main(void){'+main+'}\n');
 execFileSync('cc',['-std=c99',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 const rows=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'}).trim().split('\n').map(row=>row.split(' ').map(Number));
 const fixture={functions:cases.map(([,fn])=>fn),sourceSha256:createHash('sha256').update(source).digest('hex'),randomSha256:createHash('sha256').update(random).digest('hex'),scope:'Original thinker bodies and random table; controlled initial state. Does not verify spawning or sector adjacency.',cases:cases.map(([type,,count,min,max],i)=>({initial:{sectorIdx:0,type,count,min,max,dark:35,direction:-1},rows:rows.slice(i*140,(i+1)*140)}))};
 writeFileSync('tests/fixtures/lights-reference.json',JSON.stringify(fixture)+'\n');
}finally{rmSync(dir,{recursive:true,force:true});}
