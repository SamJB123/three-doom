// P_InitPicAnims: inclusive ranges in WAD texture/flat directory order.
const FLATS=[['NUKAGE1','NUKAGE3'],['FWATER1','FWATER4'],['SWATER1','SWATER4'],['LAVA1','LAVA4'],['BLOOD1','BLOOD3'],['RROCK05','RROCK08'],['SLIME01','SLIME04'],['SLIME05','SLIME08'],['SLIME09','SLIME12']];
const WALLS=[['BLODGR1','BLODGR4'],['SLADRIP1','SLADRIP3'],['BLODRIP1','BLODRIP4'],['FIREWALA','FIREWALL'],['GSTFONT1','GSTFONT3'],['FIRELAV3','FIRELAVA'],['FIREMAG1','FIREMAG3'],['FIREBLU1','FIREBLU2'],['ROCKRED1','ROCKRED3'],['BFALL1','BFALL4'],['SFALL1','SFALL4'],['WFALL1','WFALL4'],['DBRAIN1','DBRAIN4']];
export interface TextureAnimation {frames:string[]; index:number; initial:number;}
export function textureAnimations(names:string[],wall:boolean):Map<string,TextureAnimation>{
  const result=new Map<string,TextureAnimation>();
  for(const [first,last] of wall?WALLS:FLATS){
    const base=names.indexOf(first),end=names.indexOf(last);
    if(base<0)continue;
    if(end<=base)throw new Error(`Invalid animation range ${first}–${last}`);
    const frames=names.slice(base,end+1);
    for(let index=base;index<=end;index++)result.set(names[index],{frames,index,initial:index-base});
  }
  return result;
}
// P_UpdateSpecials uses the absolute texture/flat index, not just the frame's
// position within its animation. Before the first tic translations are identity.
export function animationFrame(animation:TextureAnimation,completedTics:number):number {
  return completedTics===0 ? animation.initial : (Math.floor((completedTics-1)/8)+animation.index)%animation.frames.length;
}
