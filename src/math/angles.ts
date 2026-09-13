import {finesine,tantoangle} from './AngleTables';
const FULL=0x100000000, TAU=2*Math.PI;
/** Binary angle boundary; the current browser input/render API uses radians. */
export const radiansToAngle=(radians:number):number=>Math.round(radians/TAU*FULL)>>>0;
export const angleToRadians=(angle:number):number=>(angle>>>0)/FULL*TAU;
export const fineSin=(radians:number):number=>finesine[radiansToAngle(radians)>>>19];
export const fineCos=(radians:number):number=>finesine[(radiansToAngle(radians)>>>19)+2048];
function slopeDiv(num:number,den:number):number {
  if(den<512)return 2048;
  return Math.min(2048,Math.floor(((num<<3)>>>0)/(den>>>8)));
}
/** R_PointToAngle: fixed-point delta -> unsigned binary angle. */
export function pointToAngle(x:number,y:number):number {
  x|=0;y|=0;
  if(!x&&!y)return 0;
  if(x>=0){
    if(y>=0)return (x>y?tantoangle[slopeDiv(y,x)]:0x40000000-1-tantoangle[slopeDiv(x,y)])>>>0;
    y=-y;
    return (x>y?-tantoangle[slopeDiv(y,x)]:0xc0000000+tantoangle[slopeDiv(x,y)])>>>0;
  }
  x=-x;
  if(y>=0)return (x>y?0x80000000-1-tantoangle[slopeDiv(y,x)]:0x40000000+tantoangle[slopeDiv(x,y)])>>>0;
  y=-y;
  return (x>y?0x80000000+tantoangle[slopeDiv(y,x)]:0xc0000000-1-tantoangle[slopeDiv(x,y)])>>>0;
}
export const pointToRadians=(x:number,y:number):number=>angleToRadians(pointToAngle(x,y));
