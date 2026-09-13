/* Render the final frame of the same hosted original-C recording. */
#define main trace_main
#include "world.c"
#undef main
int main(int argc,char** argv){
  int status=trace_main(argc,argv),x,y;byte* palette;FILE* image;
  const char* path=getenv("DOOM_REFERENCE_RENDER");
  if(status||!path)return status?status:2;
  R_SetViewSize(10,0);R_ExecuteSetViewSize();
  R_RenderPlayerView(&players[0]);ST_Drawer(false,true);HU_Drawer();
  palette=W_CacheLumpName("PLAYPAL",PU_CACHE);
  image=fopen(path,"wb");if(!image)return 3;
  fprintf(image,"P6\n320 200\n255\n");
  for(y=0;y<200;y++)for(x=0;x<320;x++)fwrite(palette+3*screens[0][y*320+x],1,3,image);
  fclose(image);return 0;
}
