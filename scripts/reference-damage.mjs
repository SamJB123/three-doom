// Original P_DamageMobj, with null inflictor/source and stubbed engine actions.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.env.DOOM_SOURCE ?? '/Users/sambide/GitHub/reference-material/DOOM/linuxdoom-1.10';
const source=readFileSync(root+'/p_inter.c','utf8');
const start=source.indexOf('void\nP_DamageMobj\n');if(start<0)throw new Error('Missing function');
const fn=source.slice(start);
const cases=[
 {health:100,damage:15,armor:4,armorType:1},{health:100,damage:30,armor:100,armorType:2},
 {health:100,damage:999,god:true},{health:100,damage:1000,god:true},
 {health:100,damage:999,invuln:true},{health:100,damage:10000,invuln:true},
 {health:10,damage:20,sector:11},{health:10,damage:20,sector:11,armor:100,armorType:1},
 {health:100,damage:9,skill:1},{health:100,damage:1,skill:1},{health:100,damage:250},
];
const header=`#include <stdio.h>
#include <stdint.h>
#include <string.h>
typedef int32_t fixed_t;
typedef struct mobj_s mobj_t;
typedef struct {int special;} sector_t;
typedef struct {sector_t *sector;} subsector_t;
typedef struct {int mass,painchance,painstate,spawnstate,seestate;} info_t;
typedef struct {int health,armorpoints,armortype,cheats,powers[1],readyweapon,damagecount;mobj_t *attacker;} player_t;
struct mobj_s {int flags,health,momx,momy,momz,x,y,z,type,threshold,reactiontime;player_t *player;info_t *info;subsector_t *subsector;int *state;mobj_t *target;};
#define MF_SHOOTABLE 1
#define MF_SKULLFLY 2
#define MF_NOCLIP 4
#define MF_JUSTHIT 8
#define CF_GODMODE 1
#define pw_invulnerability 0
#define sk_baby 1
#define wp_chainsaw 7
#define FRACUNIT 65536
#define ANG180 0x80000000u
#define ANGLETOFINESHIFT 19
#define MT_VILE 3
#define BASETHRESHOLD 100
#define S_NULL 0
static int gameskill,consoleplayer,states[4],finecosine[8192],finesine[8192],killed,pain,draws;
static player_t players[1];
static unsigned R_PointToAngle2(int a,int b,int c,int d){return 0;}
static int FixedMul(int a,int b){return (int)(((int64_t)a*b)>>16);}
static int P_Random(void){draws++;return 0;}
static void I_Tactile(int a,int b,int c){}
static void P_KillMobj(mobj_t *source,mobj_t *target){killed++;}
static void P_SetMobjState(mobj_t *target,int state){pain++;}
`;
const dir=mkdtempSync(join(tmpdir(),'doom-damage-'));
try{
 const main=cases.map(c=>`memset(players,0,sizeof(players));killed=pain=draws=0;gameskill=${c.skill??3};players[0].health=${c.health};players[0].armorpoints=${c.armor??0};players[0].armortype=${c.armorType??0};players[0].cheats=${c.god?1:0};players[0].powers[0]=${c.invuln?1:0};sector.special=${c.sector??0};target=(mobj_t){.flags=MF_SHOOTABLE,.health=${c.health},.player=players,.info=&info,.subsector=&sub};P_DamageMobj(&target,NULL,NULL,${c.damage});printf("%d %d %d %d %d %d %d %d\\n",players[0].health,target.health,players[0].armorpoints,players[0].armortype,players[0].damagecount,killed,pain,draws);`).join('\n');
 writeFileSync(join(dir,'oracle.c'),header+fn+`\nint main(void){sector_t sector={0};subsector_t sub={&sector};info_t info={100,255,1,0,2};mobj_t target;\n${main}\n}\n`);
 execFileSync('cc',['-std=c99',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 const rows=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'}).trim().split('\n').map(line=>line.split(' ').map(Number));
 writeFileSync('tests/fixtures/damage-reference.json',JSON.stringify({function:'P_DamageMobj',sourceSha256:createHash('sha256').update(source).digest('hex'),scope:'Null source/inflictor; P_Random returns zero; pain/kill/tactile actions stubbed. Does not cover knockback, kill actions or infighting.',cases:cases.map((input,i)=>({input,expected:Object.fromEntries(['health','actorHealth','armor','armorType','damageCount','killed','pain','randomDraws'].map((name,j)=>[name,rows[i][j]]))}))},null,2)+'\n');
}finally{rmSync(dir,{recursive:true,force:true});}
