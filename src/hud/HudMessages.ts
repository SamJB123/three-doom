import {HudMessageState} from '../game/HudMessageState';
import {WadGraphics} from '../menu/WadGraphics';
export class HudMessages {
  readonly state=new HudMessageState();
  private canvas=document.createElement('canvas');
  private live=document.createElement('span');
  private drawn='';
  constructor(private graphics:WadGraphics){
    this.canvas.id='hud-message';this.canvas.width=320;this.canvas.height=12;this.canvas.hidden=true;
    this.canvas.setAttribute('aria-hidden','true');
    this.live.className='screen-reader-only';this.live.setAttribute('role','status');
    document.body.append(this.canvas,this.live);
  }
  reset():void {this.state.reset();this.draw();}
  tick():void {this.state.tick();this.draw();}
  refresh():void {this.state.refresh();this.draw();}
  private draw():void {
    this.canvas.hidden=this.state.remaining===0;
    const text=this.state.remaining?this.state.text:'';
    if(text===this.drawn)return;this.drawn=text;
    this.live.textContent=text;
    const ctx=this.canvas.getContext('2d')!;ctx.clearRect(0,0,320,12);this.graphics.text(ctx,text,0,0);
  }
}
