import {getLump,parsePatch,type WAD,type Palette} from '../wad';
export class WadGraphics {
  private patches=new Map<string,{canvas:HTMLCanvasElement;left:number;top:number}>();
  constructor(private wad:WAD,private palette:Palette) {}
  color(index:number):string {return `rgb(${this.palette[index*3]},${this.palette[index*3+1]},${this.palette[index*3+2]})`;}
  menuLabel(text:string):HTMLCanvasElement|null {
    // The IWAD has menu word pictures, not a large-font character atlas.
    // Reuse their original pixels, preserving baseline and capital/lowercase
    // shapes. Coordinates are for the supplied Ultimate Doom menu patches.
    type Piece = [string,number,number];
    const resume:Piece[]=[['M_RDTHIS',0,16],['M_NGAME',16,13],['M_OPTION',78,14],['M_ROUGH',198,14],['M_NGAME',81,17],['M_NGAME',98,12]];
    const first:Piece[]|undefined = text==='Resume game' ? resume
      : text==='Load game' ? [['M_LOADG',0,60]]
      : text==='Save game' ? [['M_SAVEG',0,58]] : undefined;
    if(!first)return null;
    const pieces:Piece[]=[...first,['',0,7],['M_NGAME',51,59]];
    if(pieces.some(([name,x,width])=>name && (!this.patch(name) || this.patch(name)!.canvas.width<x+width)))return null;
    const canvas=document.createElement('canvas');canvas.width=pieces.reduce((sum,piece)=>sum+piece[2],0);canvas.height=15;
    canvas.className='doom-menu-label';canvas.setAttribute('aria-hidden','true');
    const ctx=canvas.getContext('2d')!;let cursor=0;
    for(const [name,x,width] of pieces){if(name)ctx.drawImage(this.patch(name)!.canvas,x,0,width,15,cursor,0,width,15);cursor+=width;}
    return canvas;
  }
  label(text:string):HTMLCanvasElement {
    const glyphs=[...text.toUpperCase()].map(char=>this.patch('STCFN'+String(char.charCodeAt(0)).padStart(3,'0')));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,glyphs.reduce((width,glyph)=>width+(glyph?.canvas.width??4),0));
    canvas.height=Math.max(1,...glyphs.map(glyph=>glyph?.canvas.height??0));canvas.className='doom-label';canvas.setAttribute('aria-hidden','true');
    const ctx=canvas.getContext('2d')!;let x=0;
    for(const glyph of glyphs){if(glyph)ctx.drawImage(glyph.canvas,x,0);x+=glyph?.canvas.width??4;}
    return canvas;
  }
  patch(name:string) {
    const cached=this.patches.get(name);if(cached)return cached;
    const lump=getLump(this.wad,name);if(!lump)return null;
    const patch=parsePatch(this.wad,lump.offset);
    const canvas=document.createElement('canvas');canvas.width=patch.width;canvas.height=patch.height;
    const ctx=canvas.getContext('2d')!,data=ctx.createImageData(patch.width,patch.height);
    patch.pixels.forEach((color,i)=>{if(color>=0)data.data.set([this.palette[color*3],this.palette[color*3+1],this.palette[color*3+2],255],i*4);});
    ctx.putImageData(data,0,0);
    const result={canvas,left:patch.leftOffset,top:patch.topOffset};this.patches.set(name,result);return result;
  }
  draw(ctx:CanvasRenderingContext2D,name:string,x:number,y:number):void {
    const patch=this.patch(name);if(patch)ctx.drawImage(patch.canvas,x-patch.left,y-patch.top);
  }
  text(ctx:CanvasRenderingContext2D,text:string,x:number,y:number):void {
    const start=x;
    for(const char of text.toUpperCase()){
      if(char==='\n'){x=start;y+=11;continue;}
      const code=char.charCodeAt(0),patch=code>=33&&code<=95?this.patch('STCFN'+String(code).padStart(3,'0')):null;
      if(!patch){x+=4;continue;}
      if(x+patch.canvas.width>320)break;
      ctx.drawImage(patch.canvas,x-patch.left,y-patch.top);x+=patch.canvas.width;
    }
  }
  flat(name:string):HTMLCanvasElement {
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const lump=getLump(this.wad,name);if(!lump)return canvas;
    const ctx=canvas.getContext('2d')!,data=ctx.createImageData(64,64);
    for(let i=0;i<4096;i++){const c=this.wad.buf[lump.offset+i];data.data.set([this.palette[c*3],this.palette[c*3+1],this.palette[c*3+2],255],i*4);}
    ctx.putImageData(data,0,0);return canvas;
  }
}
