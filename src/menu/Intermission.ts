import {IntermissionState,type IntermissionStats} from '../game/IntermissionState';
import {M_Random} from '../game/DoomRandom';
import {WadGraphics} from './WadGraphics';
import {playSound} from '../sound';
const NODES=[[[185,164],[148,143],[69,122],[209,102],[116,89],[166,55],[71,56],[135,29],[71,24]],[[254,25],[97,50],[188,64],[128,78],[214,92],[133,130],[208,136],[148,140],[235,158]],[[156,168],[48,154],[174,95],[265,75],[130,48],[279,23],[198,48],[140,25],[281,136]]];
const LOCATIONS=[[[224,104],[184,160],[112,136],[72,112],[88,96],[64,48],[192,40],[136,16],[80,16],[64,24]],[[128,136],[128,136],[128,136],[128,136],[128,136],[128,136],[128,136],[192,144],[128,136]],[[104,168],[40,136],[160,96],[104,80],[120,32],[40,0]]];
export class Intermission {
  readonly canvas=document.createElement('canvas');
  readonly state:IntermissionState;
  private animations:{frame:number;next:number;period:number;frames:number;x:number;y:number;level:number}[]=[];
  constructor(stats:IntermissionStats,private graphics:WadGraphics){
    this.state=new IntermissionState(stats);this.canvas.width=320;this.canvas.height=200;this.canvas.className='doom-presentation';
    this.canvas.setAttribute('aria-label',`Episode ${stats.episode} intermission`);this.initAnimations();this.draw();
  }
  private initAnimations():void {
    const ep=this.state.stats.episode;
    this.animations=(LOCATIONS[ep-1]??[]).map(([x,y],i)=>{
      const period=ep===3&&i===5?8:11;
      return {x,y,period,frame:-1,next:this.state.tic+1+(ep===2?0:M_Random()%period),frames:ep===2&&i!==7?1:3,level:ep===2?(i===8?8:i+1):-1};
    });
  }
  tick():boolean {
    const prior=this.state.phase;for(const sound of this.state.tick())playSound(sound);
    if(prior==='stats'&&this.state.phase==='next')this.initAnimations();
    this.animations.forEach((a,i)=>{
      if(a.next!==this.state.tic)return;
      if(a.level<0){a.frame=(a.frame+1)%a.frames;a.next=this.state.tic+a.period;}
      else if(!(this.state.phase==='stats'&&i===7)&&this.state.stats.next-1===a.level){a.frame=Math.min(a.frames-1,a.frame+1);a.next=this.state.tic+a.period;}
    });
    this.draw();return this.state.phase==='done';
  }
  private center(ctx:CanvasRenderingContext2D,name:string,y:number):number {
    const patch=this.graphics.patch(name);if(!patch)return 0;
    this.graphics.draw(ctx,name,(320-patch.canvas.width)/2,y);return patch.canvas.height;
  }
  private number(ctx:CanvasRenderingContext2D,n:number,x:number,y:number,digits=0):number {
    const width=this.graphics.patch('WINUM0')?.canvas.width??14;
    const text=String(Math.max(0,n)).padStart(digits,'0');
    for(const digit of [...text].reverse()){x-=width;this.graphics.draw(ctx,'WINUM'+digit,x,y);}return x;
  }
  private time(ctx:CanvasRenderingContext2D,n:number,x:number,y:number):void {
    if(n<0)return;
    if(n>61*59){const width=this.graphics.patch('WISUCKS')?.canvas.width??0;this.graphics.draw(ctx,'WISUCKS',x-width,y);return;}
    let div=1;
    do {x=this.number(ctx,Math.floor(n/div)%60,x,y,2)-(this.graphics.patch('WICOLON')?.canvas.width??0);div*=60;if(div===60||Math.floor(n/div))this.graphics.draw(ctx,'WICOLON',x,y);}while(Math.floor(n/div));
  }
  private node(ctx:CanvasRenderingContext2D,map:number,names:string[]):void {
    const location=NODES[this.state.stats.episode-1]?.[map];if(!location)return;
    const [x,y]=location;
    for(const name of names){const patch=this.graphics.patch(name);if(!patch)continue;
      if(x-patch.left>=0&&y-patch.top>=0&&x-patch.left+patch.canvas.width<320&&y-patch.top+patch.canvas.height<200){this.graphics.draw(ctx,name,x,y);return;}}
  }
  private draw():void {
    const ctx=this.canvas.getContext('2d')!,{stats,phase,counts}=this.state,ep=stats.episode;
    ctx.imageSmoothingEnabled=false;ctx.fillStyle='#000';ctx.fillRect(0,0,320,200);
    this.graphics.draw(ctx,ep<=3?`WIMAP${ep-1}`:'INTERPIC',0,0);
    this.animations.forEach((a,i)=>{if(a.frame>=0)this.graphics.draw(ctx,`WIA${ep-1}${String(ep===2&&i===8?4:i).padStart(2,'0')}${String(a.frame).padStart(2,'0')}`,a.x,a.y);});
    if(phase==='stats') {
      const height=this.center(ctx,`WILV${ep-1}${stats.map-1}`,2);this.center(ctx,'WIF',2+Math.floor(height*5/4));
      const lineHeight=Math.floor((this.graphics.patch('WINUM0')?.canvas.height??16)*3/2);
      ['WIOSTK','WIOSTI','WISCRT2'].forEach((name,i)=>{const y=50+i*lineHeight;this.graphics.draw(ctx,name,50,y);if(counts[i]>=0){this.graphics.draw(ctx,'WIPCNT',270,y);this.number(ctx,counts[i],270,y);}});
      this.graphics.draw(ctx,'WITIME',16,168);this.time(ctx,counts[3],144,168);
      if(ep<=3){this.graphics.draw(ctx,'WIPAR',176,168);this.time(ctx,counts[4],304,168);}
    } else {
      if(ep<=3){const last=stats.map===9?stats.next-2:stats.map-1;for(let i=0;i<=last;i++)this.node(ctx,i,['WISPLAT']);if(stats.didSecret)this.node(ctx,8,['WISPLAT']);if(this.state.pointer)this.node(ctx,stats.next-1,['WIURH0','WIURH1']);}
      this.center(ctx,'WIENTER',2);const name=`WILV${ep-1}${stats.next-1}`;this.center(ctx,name,2+Math.floor((this.graphics.patch(name)?.canvas.height??16)*5/4));
    }
  }
}
