import {Melt} from '../game/Melt';
/** Canvas composition only; animation advances exclusively from TicClock. */
export class ScreenWipe {
  readonly canvas=document.createElement('canvas');
  private start:HTMLCanvasElement|null=null;
  private end:HTMLCanvasElement|null=null;
  private melt:Melt|null=null;
  get active():boolean{return this.start!==null;}
  get pending():boolean{return this.active&&!this.end;}
  constructor(){
    this.canvas.width=320;this.canvas.height=200;this.canvas.id='screen-wipe';
    this.canvas.setAttribute('aria-hidden','true');
    Object.assign(this.canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:'60',imageRendering:'pixelated',pointerEvents:'none'});
    this.canvas.hidden=true;document.body.append(this.canvas);
  }
  begin(start:HTMLCanvasElement):void {
    this.start=start;this.end=null;this.melt=null;this.canvas.hidden=false;
    this.canvas.getContext('2d')!.drawImage(start,0,0);
  }
  finishCapture(end:HTMLCanvasElement):void {
    if(!this.pending)return;this.end=end;this.melt=new Melt();this.draw();
  }
  tick():void {
    if(!this.melt)return;
    if(this.melt.tick()){this.start=this.end=null;this.melt=null;this.canvas.hidden=true;return;}
    this.draw();
  }
  setPaused(paused:boolean):void {this.canvas.hidden=!this.active||paused;}
  inspect(){return {active:this.active,pending:this.pending,columns:this.melt?.columns.slice(0,160)??[]};}
  private draw():void {
    if(!this.start||!this.end||!this.melt)return;
    const ctx=this.canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;ctx.drawImage(this.end,0,0);
    for(let x=0;x<160;x++){
      const y=Math.max(0,this.melt.columns[x]);
      if(y<200)ctx.drawImage(this.start,x*2,0,2,200-y,x*2,y,2,200-y);
    }
  }
}
