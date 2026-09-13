import type { DoomMapData, DoomPlayer } from '../physics/DoomMovement';
import { FRACUNIT } from '../math/fixed';

// am_map.c line colors/flags and controls. Discovery is a Three.js-adapted
// horizontal visibility trace, not the software renderer's ML_MAPPED marking.
export class Automap {
  readonly canvas = document.createElement('canvas');
  readonly button = document.createElement('button');
  active = false;
  private seen = new Set<number>();
  private zoom = 0.25;
  private follow = true;
  private center = {x:0,y:0};
  private marks: {x:number;y:number}[] = [];
  constructor(private running: () => boolean) {
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
        case 'KeyM':if(!event.repeat){this.marks.push({...this.center});if(this.marks.length>10)this.marks.shift();}break;
        case 'KeyC':this.marks=[];break;
        case 'ArrowUp':if(!this.follow)this.center.y+=32/this.zoom;else handled=false;break;
        case 'ArrowDown':if(!this.follow)this.center.y-=32/this.zoom;else handled=false;break;
        case 'ArrowLeft':if(!this.follow)this.center.x-=32/this.zoom;else handled=false;break;
        case 'ArrowRight':if(!this.follow)this.center.x+=32/this.zoom;else handled=false;break;
        default:handled=false;
      }
      if(handled){event.preventDefault();event.stopImmediatePropagation();}
    },true);
  }
  archive() {return {seen:[...this.seen],zoom:this.zoom,follow:this.follow,center:{...this.center},marks:structuredClone(this.marks)};}
  restore(state: ReturnType<Automap['archive']>): void {
    this.seen=new Set(state.seen);this.zoom=state.zoom;this.follow=state.follow;this.center={...state.center};this.marks=structuredClone(state.marks);this.active=false;
  }
  toggle(): void {if(this.running())this.active=!this.active;}
  reset(): void {this.active=false;this.seen.clear();this.marks=[];this.follow=true;this.zoom=.25;}
  discover(map: DoomMapData, player: DoomPlayer): void {
    const x=player.mo.x/FRACUNIT,y=player.mo.y/FRACUNIT;
    // Cast through open portals until reaching a wall; do not expose distant rooms.
    for(let ray=0;ray<=90;ray++) {
      const angle=player.mo.angle+(ray-45)*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle);
      const hits: {index:number;distance:number;solid:boolean}[]=[];
      map.linedefs.forEach((line,index)=>{
        const a=map.vertexes[line.v1],b=map.vertexes[line.v2],ex=b.x-a.x,ey=b.y-a.y;
        const den=dx*ey-dy*ex;if(Math.abs(den)<1e-8)return;
        const ax=a.x-x,ay=a.y-y,t=(ax*ey-ay*ex)/den,u=(ax*dy-ay*dx)/den;
        if(t<0 || t>4096 || u<0 || u>1)return;
        const front=map.sectors[map.sidedefs[line.right].sector];
        const back=line.left<0 ? null : map.sectors[map.sidedefs[line.left].sector];
        hits.push({index,distance:t,solid:!back || Math.min(front.ceilingHeight,back.ceilingHeight)<=Math.max(front.floorHeight,back.floorHeight)});
      });
      hits.sort((a,b)=>a.distance-b.distance);
      for(const hit of hits){this.seen.add(hit.index);if(hit.solid)break;}
    }
  }
  draw(map: DoomMapData,player: DoomPlayer,allmap: boolean): void {
    const running=this.running();this.button.hidden=!running;this.canvas.hidden=!running||!this.active;
    if(this.canvas.hidden)return;
    const width=window.innerWidth,height=window.innerHeight;
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
      if(!seen)color='#666';
      else if(!back||line.flags&32)color='#c52222'; // secret doors look like walls
      else if(line.special===39||line.special===97)color='#aa4444';
      else if(front.floorHeight!==back.floorHeight)color='#9c6430';
      else if(front.ceilingHeight!==back.ceilingHeight)color='#e3cc35';
      else return;
      const a=map.vertexes[line.v1],b=map.vertexes[line.v2];
      ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(sx(a.x),sy(a.y));ctx.lineTo(sx(b.x),sy(b.y));ctx.stroke();
    });
    ctx.save();ctx.translate(sx(px),sy(py));ctx.rotate(-player.mo.angle);ctx.strokeStyle='#fff';
    ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(10,0);ctx.lineTo(3,-6);ctx.moveTo(10,0);ctx.lineTo(3,6);ctx.stroke();ctx.restore();
    ctx.font='16px monospace';ctx.fillStyle='#fff';
    this.marks.forEach((mark,i)=>ctx.fillText(String(i),sx(mark.x),sy(mark.y)));
    ctx.fillText(`Tab: close · +/−: zoom · F: follow ${this.follow?'on':'off'} · M: mark · C: clear`,16,32);
    if(!this.follow)ctx.fillText('Arrow keys: pan',16,56);
  }
}
