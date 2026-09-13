// Execute the original player-missile function with deterministic aiming/spawn
// stubs. This oracle covers probe order, fallback, spawn Z and vertical momentum;
// it deliberately does not claim sight tracing or trig-table equivalence.
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const source=process.env.DOOM_SOURCE ?? '/Users/sambide/GitHub/reference-material/DOOM/linuxdoom-1.10';
const file=readFileSync(join(source,'p_mobj.c'),'utf8');
const start=file.indexOf('void\nP_SpawnPlayerMissile');
if(start<0)throw new Error('Original P_SpawnPlayerMissile not found');
let end=file.indexOf('{',start),depth=1;
for(end++;depth;end++){if(file[end]==='{')depth++;if(file[end]==='}')depth--;}
const body=file.slice(start,end),directory=mkdtempSync(join(tmpdir(),'doom-missile-oracle-'));
const stub=`#include <stdint.h>
#include <stdio.h>
typedef int32_t fixed_t; typedef uint32_t angle_t; typedef int mobjtype_t;
#define FRACUNIT 65536
#define ANGLETOFINESHIFT 19
typedef struct {int seesound;fixed_t speed;} info_t;
typedef struct mobj_s {fixed_t x,y,z,momx,momy,momz; angle_t angle;struct mobj_s* target;info_t* info;} mobj_t;
int finecosine[8192],finesine[8192];mobj_t *linetarget,result,dummy;info_t info={0,20*FRACUNIT};
int hit,probe;angle_t probes[3];
fixed_t P_AimLineAttack(mobj_t*s,angle_t a,fixed_t range){probes[probe++]=a;linetarget=probe==hit?&dummy:0;return linetarget?FRACUNIT/4:0;}
mobj_t* P_SpawnMobj(fixed_t x,fixed_t y,fixed_t z,int type){result=(mobj_t){.x=x,.y=y,.z=z,.info=&info};return &result;}
void S_StartSound(mobj_t*m,int s){} void P_CheckMissileSpawn(mobj_t*m){}
fixed_t FixedMul(fixed_t a,fixed_t b){return (int64_t)a*b>>16;}
`;
const main=`int main(){for(int i=0;i<8192;i++)finecosine[i]=FRACUNIT;
for(hit=1;hit<=4;hit++){probe=0;mobj_t player={.z=7*FRACUNIT};P_SpawnPlayerMissile(&player,0);
printf("%d %u %d %d %d",hit,result.angle,result.z,result.momz,probe);for(int i=0;i<probe;i++)printf(" %u",probes[i]);puts("");}return 0;}`;
writeFileSync(join(directory,'oracle.c'),stub+body+'\n'+main);
execFileSync('cc',['-std=c99','-O0',join(directory,'oracle.c'),'-o',join(directory,'oracle')]);
const cases=execFileSync(join(directory,'oracle'),[],{encoding:'utf8'}).trim().split('\n').map(line=>{
  const [hit,angle,z,momz,count,...probes]=line.split(' ').map(Number);return {hit,angle,z,momz,probes};
});
const fixture={function:'P_SpawnPlayerMissile',sourceSha256:createHash('sha256').update(body).digest('hex'),scope:'Original C function with scripted aim/spawn and constant trig stubs; probe order, fallback, spawn height and vertical momentum only',cases};
writeFileSync('tests/fixtures/missile-reference.json',JSON.stringify(fixture,null,2)+'\n');
console.log('Recorded four executed-C missile aiming cases.');
