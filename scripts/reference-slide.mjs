import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.env.DOOM_SOURCE??'/Users/sambide/GitHub/reference-material/DOOM/linuxdoom-1.10';
const names=['p_map.c','p_maputl.c','r_main.c','tables.c','m_fixed.c'];
const sources=Object.fromEntries(names.map(n=>[n,readFileSync(join(root,n),'utf8')]));
function extract(name,signature){const s=sources[name],start=s.indexOf(signature);if(start<0)throw Error(signature);let end=s.indexOf('{',start),depth=1;while(depth){end++;if(s[end]==='{')depth++;if(s[end]==='}')depth--;}return s.slice(start,end+1);}
const cases=[0,1].flatMap(side=>[[65536,32768],[100000,200000],[-100000,200000],[0,-65536]].flatMap(([x,y])=>[[65536,0,0],[0,65536,1],[65536,65536,2],[-65536,2*65536,2]].map(([dx,dy,slope])=>({side,x,y,dx,dy,slope}))));
const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
typedef int32_t fixed_t;typedef uint32_t angle_t;
#define FRACBITS 16
#define ANG90 0x40000000u
#define ANG180 0x80000000u
#define ANG270 0xc0000000u
#define SLOPERANGE 2048
#define ANGLETOFINESHIFT 19
#define ST_HORIZONTAL 0
#define ST_VERTICAL 1
typedef struct {int slopetype;fixed_t dx,dy;} line_t;
typedef struct {fixed_t x,y;} mobj_t;
static fixed_t viewx,viewy,tmxmove,tmymove;static mobj_t mo,*slidemo=&mo;static int testSide;
int P_PointOnLineSide(fixed_t x,fixed_t y,line_t* ld){return testSide;}
${sources['tables.c'].replace('#include "tables.h"','')}
int *finecosine=&finesine[2048];
${extract('m_fixed.c','fixed_t\nFixedMul')}
${extract('r_main.c','angle_t\nR_PointToAngle\n')}
angle_t R_PointToAngle2(fixed_t x1,fixed_t y1,fixed_t x2,fixed_t y2){viewx=x1;viewy=y1;return R_PointToAngle(x2,y2);}
${extract('p_maputl.c','fixed_t\nP_AproxDistance')}
${extract('p_map.c','void P_HitSlideLine')}
int main(void){line_t line;
${cases.map(a=>`testSide=${a.side};tmxmove=${a.x};tmymove=${a.y};line.dx=${a.dx};line.dy=${a.dy};line.slopetype=${a.slope};P_HitSlideLine(&line);printf("%d %d\\n",tmxmove,tmymove);`).join('\n')}
}
`;
const dir=mkdtempSync(join(tmpdir(),'doom-slide-'));try{
 writeFileSync(join(dir,'oracle.c'),c);const flags=['-std=c99','-fwrapv'];execFileSync('cc',[...flags,join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 const values=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'}).trim().split('\n').map(s=>s.split(' ').map(Number));
 writeFileSync('tests/fixtures/slide-reference.json',JSON.stringify({function:'P_HitSlideLine',scope:'Original projection, with scripted P_PointOnLineSide result; no traversal or collision',sources:Object.fromEntries(names.map(n=>[n,createHash('sha256').update(sources[n]).digest('hex')])),compiler:execFileSync('cc',['--version'],{encoding:'utf8'}).trim(),flags,cases:cases.map((a,i)=>({...a,result:values[i]}))},null,2)+'\n');
}finally{rmSync(dir,{recursive:true,force:true});}
