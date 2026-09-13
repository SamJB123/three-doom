// Execute the original R_PointToAngle and SlopeDiv with original tables.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.env.DOOM_SOURCE ?? '/Users/sambide/GitHub/reference-material/DOOM/linuxdoom-1.10';
const source=readFileSync(root+'/r_main.c','utf8');
const tables=readFileSync(root+'/tables.c','utf8');
const start=source.indexOf('angle_t\nR_PointToAngle\n');
const end=source.indexOf('angle_t\nR_PointToAngle2',start);
if(start<0||end<0)throw new Error('Missing original function');
const fn=source.slice(start,end);
const inputs=[[0,0],[65536,0],[0,65536],[-65536,0],[0,-65536],...[1,-1].flatMap(x=>[1,-1].flatMap(y=>[[x*65536,y*65536],[x*131072,y*65536],[x*65536,y*131072]])),[511,1],[512,1],[200000000,123456789]];
const dir=mkdtempSync(join(tmpdir(),'doom-angle-'));
try{
  const c=`#include <stdio.h>\n#include <stdint.h>\ntypedef int32_t fixed_t;\ntypedef uint32_t angle_t;\n#define ANG90 0x40000000u\n#define ANG180 0x80000000u\n#define ANG270 0xc0000000u\n#define SLOPERANGE 2048\nstatic fixed_t viewx,viewy;\n${tables.replace(/#include "tables.h"/,'')}\n${fn}\nint main(void){\n${inputs.map(([x,y])=>`printf("%u\\n",R_PointToAngle(${x},${y}));`).join('\n')}\n}\n`;
  writeFileSync(join(dir,'oracle.c'),c);execFileSync('cc',['-std=c99',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
  const results=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'}).trim().split('\n').map(Number);
  writeFileSync('tests/fixtures/angle-reference.json',JSON.stringify({function:'R_PointToAngle / SlopeDiv',sourceSha256:createHash('sha256').update(source).digest('hex'),tablesSha256:createHash('sha256').update(tables).digest('hex'),cases:inputs.map(([x,y],i)=>({x,y,angle:results[i]}))},null,2)+'\n');
}finally{rmSync(dir,{recursive:true,force:true});}
