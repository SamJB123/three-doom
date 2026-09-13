import {pointToAngle} from '../math/angles';
import {finesine} from '../math/AngleTables';
import {FRACUNIT,fixedMul} from '../math/fixed';
export interface SoundPoint {x:number;y:number;}
/** S_AdjustSoundParams: horizontal approximate distance and binary-angle pan. */
export function soundParameters(listener:SoundPoint&{angle:number},source:SoundPoint,map:number,volume=127):{volume:number;separation:number}{
  const dx=Math.abs(listener.x-source.x),dy=Math.abs(listener.y-source.y);
  let distance=dx+dy-(Math.min(dx,dy)>>1);
  if(map!==8 && distance>1200*FRACUNIT)return {volume:0,separation:128};
  let angle=pointToAngle(source.x-listener.x,source.y-listener.y);
  angle=(angle>listener.angle?angle-listener.angle:angle+0xffffffff-listener.angle)>>>0;
  const separation=dx===0&&dy===0?128:128-(fixedMul(96*FRACUNIT,finesine[angle>>>19])>>16);
  if(distance>=160*FRACUNIT){
    if(map===8){distance=Math.min(distance,1200*FRACUNIT);volume=15+Math.trunc((volume-15)*((1200*FRACUNIT-distance)>>16)/1040);}
    else volume=Math.trunc(volume*((1200*FRACUNIT-distance)>>16)/1040);
  }
  return {volume,separation};
}
/** i_sound.c addsfx's quadratic stereo volume lookup. */
export function stereoGains(volume:number,separation:number):{left:number;right:number}{
  let sep=separation+1;
  const left=volume-((volume*sep*sep)>>16);sep-=257;
  const right=volume-((volume*sep*sep)>>16);
  return {left:left/127,right:right/127};
}
