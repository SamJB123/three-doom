import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.env.DOOM_SOURCE ?? '/Users/sambide/GitHub/reference-material/DOOM/linuxdoom-1.10';
const source=readFileSync(root+'/f_wipe.c','utf8');
function extract(name){const m=source.match(new RegExp('(int|void)\\n'+name+'\\n'));if(!m)throw new Error(name);const open=source.indexOf('{',m.index);let depth=1,end=open+1;for(;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}return source.slice(m.index,end);}
const dir=mkdtempSync(join(tmpdir(),'doom-melt-'));
try{
 const header=`#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <stdbool.h>\ntypedef bool boolean;\n#define PU_STATIC 0\nstatic unsigned char a[1600],b[1600],c[1600],*wipe_scr_start=a,*wipe_scr_end=b,*wipe_scr=c;\nstatic int *y,draws;\nstatic void *Z_Malloc(int n,int tag,int user){return malloc(n);}\nstatic void Z_Free(void *p){free(p);}\nstatic int M_Random(void){return (draws++*17)&255;}\n`;
 const funcs=['wipe_shittyColMajorXform','wipe_initMelt','wipe_doMelt','wipe_exitMelt'].map(extract).join('\n');
 writeFileSync(join(dir,'oracle.c'),header+funcs+'\nint main(void){wipe_initMelt(8,200,0);printf("0 %d %d %d %d\\n",y[0],y[1],y[2],y[3]);for(int i=0;i<100;i++){int done=wipe_doMelt(8,200,1);printf("%d %d %d %d %d\\n",done,y[0],y[1],y[2],y[3]);if(done)break;}wipe_exitMelt(8,200,0);}\n');
 execFileSync('cc',['-std=c99',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 const rows=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'}).trim().split('\n').map(row=>row.split(' ').map(Number));
 writeFileSync('tests/fixtures/melt-reference.json',JSON.stringify({function:'wipe_initMelt / wipe_doMelt',sourceSha256:createHash('sha256').update(source).digest('hex'),width:8,height:200,random:'(drawIndex * 17) & 255',frames:rows.map(([done,...columns])=>({done:!!done,columns}))},null,2)+'\n');
}finally{rmSync(dir,{recursive:true,force:true});}
