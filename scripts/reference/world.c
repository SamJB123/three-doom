/* Headless host for the supplied original engine; no replacement gameplay. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "doomdef.h"
#include "doomstat.h"
#include "d_main.h"
#include "d_net.h"
#include "g_game.h"
#include "m_argv.h"
#include "m_random.h"
#include "m_menu.h"
#include "p_local.h"
#include "r_main.h"
#include "s_sound.h"
#include "w_wad.h"
#include "v_video.h"
#include "z_zone.h"
#include "hu_stuff.h"
#include "st_stuff.h"
#include "i_sound.h"
extern int prndindex;
char* sndserver_filename="";
void I_InitGraphics(void){} void I_ShutdownGraphics(void){}
void I_SetPalette(byte* p){} void I_UpdateNoBlit(void){} void I_FinishUpdate(void){}
void I_ReadScreen(byte* p){memcpy(p,screens[0],320*200);}
void I_StartTic(void){} void I_StartFrame(void){}
void I_InitSound(void){} void I_UpdateSound(void){} void I_SubmitSound(void){} void I_ShutdownSound(void){} void I_SetChannels(void){}
int I_GetSfxLumpNum(sfxinfo_t* s){char name[16];sprintf(name,"ds%s",s->name);return W_GetNumForName(name);}
int I_StartSound(int id,int volume,int separation,int pitch,int priority){return 0;}
void I_StopSound(int h){} int I_SoundIsPlaying(int h){return 0;} void I_UpdateSoundParams(int h,int v,int s,int p){}
void I_InitMusic(void){} void I_ShutdownMusic(void){} void I_SetMusicVolume(int v){} void I_PauseSong(int h){} void I_ResumeSong(int h){}
int I_RegisterSong(void* data){return 0;} void I_PlaySong(int h,int loop){} void I_StopSong(int h){} void I_UnRegisterSong(int h){}
void I_InitNetwork(void){} void I_NetCmd(void){}
int main(int argc,char** argv){
  int tic,limit,length,lump,i,offset;thinker_t* thinker;int first;byte* demo;char* files[2];FILE* out;
  if(argc!=5){fprintf(stderr,"usage: reference-world IWAD DEMO TICS OUTPUT\n");return 2;}
  myargc=1;myargv=argv;files[0]=argv[1];files[1]=NULL;limit=atoi(argv[3]);if(limit<1||limit>350)return 2;out=fopen(argv[4],"w");if(!out)return 3;
  gamemode=retail;gamemission=doom;modifiedgame=false;consoleplayer=displayplayer=0;playeringame[0]=true;viewactive=true;
  Z_Init();V_Init();W_InitMultipleFiles(files);R_Init();P_Init();M_Init();S_Init(0,0);HU_Init();ST_Init();
  lump=W_GetNumForName(argv[2]);length=W_LumpLength(lump);demo=W_CacheLumpNum(lump,PU_STATIC);
  if(length<14||demo[0]!=109||demo[1]>4||demo[2]<1||demo[2]>4||demo[3]<1||demo[3]>9||demo[9]!=1)return 4;
  for(i=4;i<13;i++)if(i!=9&&demo[i])return 4;
  for(offset=13;offset<length&&demo[offset]!=128;offset+=4)
    if(offset+4>length||(demo[offset+3]&128))return 4;
  if(offset>=length)return 4;
  G_InitNew(demo[1],demo[2],demo[3]);demo+=13;
  for(tic=0;tic<limit&&demo[0]!=128;tic++,demo+=4){
    player_t* p=&players[0];mobj_t* m=p->mo;
    p->cmd.forwardmove=(signed char)demo[0];p->cmd.sidemove=(signed char)demo[1];p->cmd.angleturn=demo[2]<<8;p->cmd.buttons=demo[3];
    P_Ticker();gametic++;
    fprintf(out,"[%d,%d,%d,%d,%d,%d,%d,%u,%d,%d,%d,%d,%d,%d,%d,[",leveltime,m->x,m->y,m->z,m->momx,m->momy,m->momz,m->angle,m->health,(int)(m->state-states),m->tics,prndindex,p->psprites[0].sx,p->psprites[0].sy,p->readyweapon);
    first=1;
    for(thinker=thinkercap.next;thinker!=&thinkercap;thinker=thinker->next){
      mobj_t* a;if(thinker->function.acp1!=(actionf_p1)P_MobjThinker)continue;a=(mobj_t*)thinker;
      fprintf(out,"%s[%d,%d,%d,%d,%d,%d,%d,%u,%d,%d,%d,%d]",first?"":",",a->type,a->x,a->y,a->z,a->momx,a->momy,a->momz,a->angle,a->health,(int)(a->state-states),a->tics,a->flags);first=0;
    }
    fprintf(out,"]]\n");
  }
  fclose(out);return 0;
}
