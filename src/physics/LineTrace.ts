import type {DoomMapData} from './DoomMovement';
import {FRACUNIT as F,fixedMul,fixedDiv} from '../math/fixed';
export interface DivLine {x:number;y:number;dx:number;dy:number;}
/** P_PointOnDivlineSide, including the signed cross-product shortcut. */
export function divlineSide(x:number,y:number,line:DivLine):number {
  if(!line.dx)return x<=line.x?Number(line.dy>0):Number(line.dy<0);
  if(!line.dy)return y<=line.y?Number(line.dx<0):Number(line.dx>0);
  const dx=(x-line.x)|0,dy=(y-line.y)|0;
  if((line.dy^line.dx^dx^dy)&0x80000000)return (line.dy^dx)&0x80000000?1:0;
  return fixedMul(dy>>8,line.dx>>8)<fixedMul(line.dy>>8,dx>>8)?0:1;
}
/** P_PointOnLineSide uses the integer map-line deltas, not divline precision. */
export function lineSide(x:number,y:number,line:DivLine):number {
  if(!line.dx)return x<=line.x?Number(line.dy>0):Number(line.dy<0);
  if(!line.dy)return y<=line.y?Number(line.dx<0):Number(line.dx>0);
  return fixedMul((y-line.y)|0,line.dx>>16)<fixedMul(line.dy>>16,(x-line.x)|0)?0:1;
}
export function interceptVector(trace:DivLine,line:DivLine):number {
  const den=(fixedMul(line.dy>>8,trace.dx)-fixedMul(line.dx>>8,trace.dy))|0;
  if(!den)return 0;
  return fixedDiv((fixedMul((line.x-trace.x)>>8,line.dy)+fixedMul((trace.y-line.y)>>8,line.dx))|0,den);
}
/** P_PathTraverse / PIT_AddLineIntercepts: source fixed DDA, boundary nudge and stable intercept order. */
export function traceLines(x1:number,y1:number,x2:number,y2:number,map:DoomMapData) {
  const block=map.blockmap,orgX=block.originX*F,orgY=block.originY*F;
  if(((x1-orgX)&(128*F-1))===0)x1+=F;
  if(((y1-orgY)&(128*F-1))===0)y1+=F;
  const trace={x:x1,y:y1,dx:(x2-x1)|0,dy:(y2-y1)|0};
  x1=(x1-orgX)|0;y1=(y1-orgY)|0;x2=(x2-orgX)|0;y2=(y2-orgY)|0;
  let mx=x1>>23,my=y1>>23;const endX=x2>>23,endY=y2>>23;
  const sx=Math.sign(endX-mx),sy=Math.sign(endY-my);
  const partialX=sx>0?F-((x1>>7)&(F-1)):sx<0?(x1>>7)&(F-1):F;
  const partialY=sy>0?F-((y1>>7)&(F-1)):sy<0?(y1>>7)&(F-1):F;
  const ystep=sx?fixedDiv(y2-y1,Math.abs(x2-x1)):256*F;
  const xstep=sy?fixedDiv(x2-x1,Math.abs(y2-y1)):256*F;
  let yi=((y1>>7)+fixedMul(partialX,ystep))|0,xi=((x1>>7)+fixedMul(partialY,xstep))|0;
  const seen=new Set<number>(),intercepts:{lineIdx:number;frac:number}[]=[];
  for(let count=0;count<64;count++){
    if(mx>=0&&my>=0&&mx<block.columns&&my<block.rows)for(const lineIdx of block.lists[my*block.columns+mx]){
      if(seen.has(lineIdx))continue;seen.add(lineIdx);
      const line=map.linedefs[lineIdx],a=map.vertexes[line.v1],b=map.vertexes[line.v2];
      const div={x:a.x*F,y:a.y*F,dx:(b.x-a.x)*F,dy:(b.y-a.y)*F};
      const large=Math.abs(trace.dx)>16*F||Math.abs(trace.dy)>16*F;
      const side1=large?divlineSide(div.x,div.y,trace):lineSide(trace.x,trace.y,div);
      const side2=large?divlineSide(b.x*F,b.y*F,trace):lineSide(trace.x+trace.dx,trace.y+trace.dy,div);
      if(side1===side2)continue;
      const frac=interceptVector(trace,div);
      if(frac>=0&&frac<=F)intercepts.push({lineIdx,frac});
    }
    if(mx===endX&&my===endY)break;
    if((yi>>16)===my){yi=(yi+ystep)|0;mx+=sx;}
    else if((xi>>16)===mx){xi=(xi+xstep)|0;my+=sy;}
  }
  intercepts.sort((a,b)=>a.frac-b.frac);
  return {trace,intercepts};
}
