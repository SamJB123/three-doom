import {FINALE_TEXT} from './FinaleText';
import {WadGraphics} from './WadGraphics';
import {playSound} from '../sound';

// F_Ticker/F_TextWrite/F_BunnyScroll: advances only from the shared 35 Hz clock.
export class Finale {
  readonly canvas=document.createElement('canvas');
  private count=0;
  private art=false;
  private lastBunnyStage=0;
  private background:HTMLCanvasElement;
  get music():string {return this.episode===3&&this.art?'D_BUNNY':'D_VICTOR';}
  constructor(private episode:number,private graphics:WadGraphics) {
    this.canvas.width=320;this.canvas.height=200;this.canvas.className='doom-presentation';
    this.canvas.setAttribute('aria-label',`Episode ${episode} ending`);
    this.background=graphics.flat(['FLOOR4_8','SFLR6_1','MFLR8_4','MFLR8_3'][episode-1]);
    this.draw();
  }
  tick():void {
    this.count++;
    if(!this.art && this.count>FINALE_TEXT[this.episode-1].length*3+250){this.art=true;this.count=0;}
    this.draw();
  }
  showArt():void {this.art=true;this.count=0;this.draw();}
  private draw():void {
    const ctx=this.canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#000';ctx.fillRect(0,0,320,200);
    if(!this.art) {
      ctx.fillStyle=ctx.createPattern(this.background,'repeat')!;ctx.fillRect(0,0,320,200);
      this.graphics.text(ctx,FINALE_TEXT[this.episode-1].slice(0,Math.max(0,Math.floor((this.count-10)/3))),10,10);
      return;
    }
    if(this.episode!==3){this.graphics.draw(ctx,['CREDIT','VICTORY2','','ENDPIC'][this.episode-1],0,0);return;}
    const scroll=Math.max(0,Math.min(320,320-Math.trunc((this.count-230)/2)));
    const first=this.graphics.patch('PFUB2'),second=this.graphics.patch('PFUB1');
    if(first)ctx.drawImage(first.canvas,-scroll,0);
    if(second)ctx.drawImage(second.canvas,320-scroll,0);
    if(this.count>=1130) {
      const stage=this.count<1180?0:Math.min(6,Math.floor((this.count-1180)/5));
      this.graphics.draw(ctx,'END'+stage,108,68);
      if(stage>this.lastBunnyStage)playSound('pistol');this.lastBunnyStage=stage;
    }
  }
}
