import {visibleMapLines} from './MapDiscovery';
import {WadGraphics} from '../menu/WadGraphics';
import {mapTitle} from '../game/Campaign';
import {gameRules} from '../game/GameRules';
import type { DoomMapData, DoomPlayer } from '../physics/DoomMovement';
import { FRACUNIT } from '../math/fixed';

// am_map.c line colors/flags and controls. Discovery is a Three.js-adapted
// BSP/angular visibility with the Three.js camera's horizontal field of view.
export class Automap {
  readonly canvas = document.createElement('canvas');
  readonly button = document.createElement('button');
  active = false;
  private seen = new Set<number>();
  private zoom = 0.25;
  private follow = true;
  private center = {x:0,y:0};
  private nextMark=0;
  private marks: {x:number;y:number}[] = [];
  constructor(private running: () => boolean,private graphics:WadGraphics) {
    this.canvas.id='automap'; this.canvas.setAttribute('aria-label','Automap');
    this.canvas.hidden=true;
    this.button.id='automap-button'; this.button.textContent='Map';this.button.hidden=true;
    this.button.onclick=()=>this.toggle();
    document.body.append(this.canvas,this.button);
    document.addEventListener('keydown',event=>{
      if(!this.running()) return;
      if(event.code==='Tab') {event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)this.toggle();return;}
      if(!this.active) return;
      let handled=true;
      switch(event.code) {
        case 'Equal':case 'NumpadAdd':this.zoom=Math.min(8,this.zoom*1.15);break;
        case 'Minus':case 'NumpadSubtract':this.zoom=Math.max(0.02,this.zoom/1.15);break;
        case 'KeyF':if(!event.repeat)this.follow=!this.follow;break;
        case 'KeyM':if(!event.repeat){this.marks[this.nextMark]={...this.center};this.nextMark=(this.nextMark+1)%10;}break;
        case 'KeyC':this.marks=[];this.nextMark=0;break;
        case 'ArrowUp':if(!this.follow)this.center.y+=32/this.zoom;else handled=false;break;
        case 'ArrowDown':if(!this.follow)this.center.y-=32/this.zoom;else handled=false;break;
        case 'ArrowLeft':if(!this.follow)this.center.x-=32/this.zoom;else handled=false;break;
        case 'ArrowRight':if(!this.follow)this.center.x+=32/this.zoom;else handled=false;break;
        default:handled=false;
      }
      if(handled){event.preventDefault();event.stopImmediatePropagation();}
    },true);
  }
  archive() {return {nextMark:this.nextMark,seen:[...this.seen],zoom:this.zoom,follow:this.follow,center:{...this.center},marks:structuredClone(this.marks)};}
  restore(state: ReturnType<Automap['archive']>): void {
    this.nextMark=state.nextMark??state.marks.length%10;
    this.seen=new Set(state.seen);this.zoom=state.zoom;this.follow=state.follow;this.center={...state.center};this.marks=structuredClone(state.marks);this.active=false;
  }
  toggle(): void {if(this.running())this.active=!this.active;}
  reset(): void {this.active=false;this.seen.clear();this.marks=[];this.nextMark=0;this.follow=true;this.zoom=.25;}
  discover(map:DoomMapData,player:DoomPlayer,halfFov=Math.PI/4):void {
    for(const index of visibleMapLines(map,player,halfFov))this.seen.add(index);
  }
  draw(map: DoomMapData,player: DoomPlayer,allmap: boolean,invisible=false): void {
    const running=this.running();this.button.hidden=!running;this.canvas.hidden=!running||!this.active;
    if(this.canvas.hidden)return;
    const width=window.innerWidth,height=Math.round(document.getElementById('game')!.getBoundingClientRect().height);
    this.canvas.style.height=`${height}px`;
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    const ctx=this.canvas.getContext('2d')!;
    ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
    const px=player.mo.x/FRACUNIT,py=player.mo.y/FRACUNIT;
    if(this.follow)this.center={x:px,y:py};
    const sx=(x:number)=>width/2+(x-this.center.x)*this.zoom,sy=(y:number)=>height/2-(y-this.center.y)*this.zoom;
    ctx.lineWidth=1.5;
    map.linedefs.forEach((line,index)=>{
      if(line.flags&128)return; // ML_DONTDRAW
      const seen=this.seen.has(index)||!!(line.flags&256);
      if(!seen&&!allmap)return;
      const front=map.sectors[map.sidedefs[line.right].sector];
      const back=line.left<0?null:map.sectors[map.sidedefs[line.left].sector];
      let color:string;
      if(!seen)color=this.graphics.color(99);
      else if(!back)color=this.graphics.color(176); // secret doors look like walls
      else if(line.special===39)color=this.graphics.color(184);
      else if(line.flags&32)color=this.graphics.color(176);
      else if(front.floorHeight!==back.floorHeight)color=this.graphics.color(64);
      else if(front.ceilingHeight!==back.ceilingHeight)color=this.graphics.color(231);
      else return;
      const a=map.vertexes[line.v1],b=map.vertexes[line.v2];
      ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(sx(a.x),sy(a.y));ctx.lineTo(sx(b.x),sy(b.y));ctx.stroke();
    });
    ctx.save();ctx.translate(sx(px),sy(py));ctx.rotate(-player.mo.angle);ctx.strokeStyle=this.graphics.color(invisible?246:209);
    ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(10,0);ctx.lineTo(3,-6);ctx.moveTo(10,0);ctx.lineTo(3,6);ctx.stroke();ctx.restore();
    const scale=Math.max(1,Math.min(3,Math.floor(width/320)));
    for(const [i,mark] of this.marks.entries()){
      ctx.save();ctx.translate(sx(mark.x),sy(mark.y));ctx.scale(scale,scale);this.graphics.draw(ctx,`AMMNUM${i}`,0,0);ctx.restore();
    }
    ctx.save();ctx.scale(scale,scale);
    this.graphics.text(ctx,mapTitle(gameRules.episode,gameRules.map),2,height/scale-10);
    const hintY=Math.ceil(((document.getElementById('game-actions')?.getBoundingClientRect().bottom??50)+8)/scale);
    this.graphics.text(ctx,`+/- ZOOM  F FOLLOW ${this.follow?'ON':'OFF'}  M MARK  C CLEAR`,4,hintY);
    if(!this.follow)this.graphics.text(ctx,'ARROWS PAN',4,hintY+11);
    ctx.restore();
  }
}
