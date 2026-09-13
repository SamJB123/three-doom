import {pointToAngle} from '../math/angles';
import {finesine} from '../math/AngleTables';
import {fixedMul} from '../math/fixed';
/** P_HitSlideLine: fixed momentum projected using Doom's approximate length and fine angles. */
export function slideProjection(x:number,y:number,dx:number,dy:number,side:number):[number,number] {
  if(!dy)return [x,0];
  if(!dx)return [0,y];
  const lineAngle=(pointToAngle(dx,dy)+(side?0x80000000:0))>>>0;
  let delta=(pointToAngle(x,y)-lineAngle)>>>0;
  if(delta>0x80000000)delta=(delta+0x80000000)>>>0;
  const ax=Math.abs(x),ay=Math.abs(y),length=(ax+ay-(Math.min(ax,ay)>>1))|0;
  const projected=fixedMul(length,finesine[(delta>>>19)+2048]);
  return [fixedMul(projected,finesine[(lineAngle>>>19)+2048]),fixedMul(projected,finesine[lineAngle>>>19])];
}
