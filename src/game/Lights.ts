// p_lights.c: all mutable timing is explicit so saving preserves the next tic.
import type { Sector, Linedef, Sidedef } from '../wad';
import { P_Random } from './DoomRandom';
import { addThinker, archivedThinker, markSectorDirty, busySectors } from './Thinkers';
import { lightLevelToColormapIndex } from '../wad/ColormapParser';

export interface LightState {
  sectorIdx: number;
  type: 'fire' | 'flash' | 'strobe' | 'glow';
  min: number; max: number; count: number; dark: number; direction: number;
}
function minimum(si: number, lines: Linedef[], sides: Sidedef[], sectors: Sector[]): number {
  let min=sectors[si].lightLevel;
  for(const line of lines) {
    if(line.left<0)continue;
    const a=sides[line.right].sector,b=sides[line.left].sector;
    if(a===si)min=Math.min(min,sectors[b].lightLevel);
    else if(b===si)min=Math.min(min,sectors[a].lightLevel);
  }
  return min;
}
export function restoreLights(state: LightState, sectors: Sector[]): void {
  addThinker(archivedThinker(()=>{
    const sector=sectors[state.sectorIdx], old=sector.lightLevel;
    if(state.type==='glow') {
      sector.lightLevel+=state.direction*8;
      if(sector.lightLevel<=state.min || sector.lightLevel>=state.max) {
        sector.lightLevel=old;state.direction=-state.direction;
      }
    } else if(--state.count===0) {
      if(state.type==='fire') {
        const amount=(P_Random()&3)*16;
        sector.lightLevel=old-amount<state.min ? state.min : state.max-amount;
        state.count=4;
      } else if(state.type==='flash') {
        const bright=old===state.max;
        sector.lightLevel=bright ? state.min : state.max;
        state.count=(P_Random()&(bright ? 7 : 64))+1;
      } else {
        sector.lightLevel=old===state.min ? state.max : state.min;
        state.count=old===state.min ? 5 : state.dark;
      }
    }
    if(lightLevelToColormapIndex(old)!==lightLevelToColormapIndex(sector.lightLevel))markSectorDirty(state.sectorIdx);
    return true;
  },'light',()=>state));
}
export function spawnLightSpecials(sectors: Sector[], lines: Linedef[], sides: Sidedef[]): void {
  sectors.forEach((sector,sectorIdx)=>{
    const special=sector.special;
    if(![1,2,3,4,8,12,13,17].includes(special))return;
    const state:LightState={sectorIdx,type:'strobe',max:sector.lightLevel,
      min:minimum(sectorIdx,lines,sides,sectors),count:1,dark:35,direction:-1};
    if(special===1){state.type='flash';state.count=(P_Random()&64)+1;}
    else if(special===17){state.type='fire';state.min+=16;state.count=4;}
    else if(special===8)state.type='glow';
    else {
      if(state.min===state.max)state.min=0;
      state.dark=[2,4,13].includes(special)?15:35;
      state.count=[12,13].includes(special)?1:(P_Random()&7)+1;
    }
    if(special!==4)sector.special=0;
    restoreLights(state,sectors);
  });
}

import type { DoomMapData } from '../physics/DoomMovement';

export function evLightTurnOff(tag: number, map: DoomMapData): void {
  map.sectors.forEach((s,i)=>{if(s.tag===tag){s.lightLevel=minimum(i,map.linedefs,map.sidedefs,map.sectors);markSectorDirty(i);}});
}
export function evLightTurnOn(tag: number, bright: number, map: DoomMapData): void {
  // C intentionally carries the first discovered maximum to later tagged sectors.
  map.sectors.forEach((s,i)=>{
    if(s.tag!==tag)return;
    if(!bright)for(const line of map.linedefs) {
      if(line.left<0)continue;
      const a=map.sidedefs[line.right].sector,b=map.sidedefs[line.left].sector;
      if(a===i)bright=Math.max(bright,map.sectors[b].lightLevel);
      else if(b===i)bright=Math.max(bright,map.sectors[a].lightLevel);
    }
    s.lightLevel=bright;markSectorDirty(i);
  });
}

/** EV_StartLightStrobing / P_SpawnStrobeFlash: a moving sector cannot start. */
export function evStartLightStrobing(tag:number,map:DoomMapData):void {
  map.sectors.forEach((sector,sectorIdx)=>{
    if(sector.tag!==tag||busySectors.has(sectorIdx))return;
    let min=minimum(sectorIdx,map.linedefs,map.sidedefs,map.sectors);
    if(min===sector.lightLevel)min=0;
    sector.special=0;
    restoreLights({sectorIdx,type:'strobe',min,max:sector.lightLevel,count:(P_Random()&7)+1,dark:35,direction:-1},map.sectors);
  });
}
