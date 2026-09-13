import type {PlayerStatusState} from '../ecs/traits';
import {getLump,type WAD} from '../wad';

/** ST_doPaletteStuff: PLAYPAL 1–8 damage, 9–12 bonus, 13 radiation. */
export function hudPalette(state:PlayerStatusState):number {
  const damage=Math.max(state.damageCount,state.powers.strength?12-(state.powers.strength>>6):0);
  if(damage>0)return 1+Math.min(7,(damage+7)>>3);
  if(state.bonusCount>0)return 9+Math.min(3,(state.bonusCount+7)>>3);
  return state.powers.ironfeet>128||(state.powers.ironfeet&8)?13:0;
}

/** Retail PLAYPAL maps each RGB channel independently. Retain exact byte
 * mappings; interpolate only values not present in the original palette
 * (for Three.js antialiasing). Reject nonseparable custom palettes. */
export function paletteChannels(base:Uint8Array,target:Uint8Array):number[][] {
  if(base.length!==768||target.length!==768)throw Error('Invalid PLAYPAL palette size');
  return [0,1,2].map(channel=>{
    const table=new Array<number>(256);
    for(let i=channel;i<768;i+=3){
      const from=base[i],to=target[i];
      if(table[from]!==undefined&&table[from]!==to)throw Error('PLAYPAL requires an indexed-color renderer');
      table[from]=to;
    }
    const known=Array.from({length:256},(_,i)=>i).filter(i=>table[i]!==undefined);
    for(let i=0;i<256;i++)if(table[i]===undefined){
      const hi=known.find(value=>value>i)??known[known.length-1];
      const lo=[...known].reverse().find(value=>value<i)??known[0];
      table[i]=hi===lo?table[lo]:table[lo]+(table[hi]-table[lo])*(i-lo)/(hi-lo);
    }
    return table;
  });
}

export class PaletteEffects {
  private current=-1;
  private svg:SVGSVGElement;
  constructor(wad:WAD){
    const lump=getLump(wad,'PLAYPAL');
    if(!lump||lump.size<14*768)throw Error('Ultimate Doom requires fourteen PLAYPAL palettes');
    const bytes=wad.buf.slice(lump.offset,lump.offset+lump.size),base=bytes.subarray(0,768);
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    this.svg=svg;
    svg.setAttribute('width','0');svg.setAttribute('height','0');svg.style.position='absolute';
    svg.setAttribute('aria-hidden','true');
    for(let palette=1;palette<14;palette++){
      const filter=document.createElementNS(ns,'filter');filter.id=`doom-palette-${palette}`;
      filter.setAttribute('color-interpolation-filters','sRGB');
      const transfer=document.createElementNS(ns,'feComponentTransfer');
      paletteChannels(base,bytes.subarray(palette*768,(palette+1)*768)).forEach((values,i)=>{
        const fn=document.createElementNS(ns,`feFunc${'RGB'[i]}`);fn.setAttribute('type','table');
        fn.setAttribute('tableValues',values.map(value=>String(value/255)).join(' '));transfer.append(fn);
      });
      filter.append(transfer);svg.append(filter);
    }
    document.body.append(svg);
  }
  dispose():void {this.svg.remove();document.documentElement.style.removeProperty('--doom-palette-filter');}
  update(state:PlayerStatusState):void {
    const palette=hudPalette(state);if(palette===this.current)return;this.current=palette;
    document.documentElement.style.setProperty('--doom-palette-filter',palette?`url(#doom-palette-${palette})`:'none');
  }
}
