import type {DoomMapData} from '../physics/DoomMovement';

/** Validate references before P_SetupLevel exposes them to geometry/thinkers. */
export function validateMap(map:DoomMapData):void {
  const index=(value:number,length:number)=>Number.isInteger(value)&&value>=0&&value<length;
  const fail=(part:string):never=>{throw Error(`Invalid map ${part}`);};
  if(!map.vertexes.length||!map.linedefs.length||!map.sectors.length||!map.subsectors.length)fail('empty geometry');
  for(const line of map.linedefs){
    if(!index(line.v1,map.vertexes.length)||!index(line.v2,map.vertexes.length))fail('linedef vertices');
    if(!index(line.right,map.sidedefs.length)||(line.left!==-1&&!index(line.left,map.sidedefs.length)))fail('linedef sides');
  }
  for(const side of map.sidedefs)if(!index(side.sector,map.sectors.length))fail('sidedef sector');
  for(const seg of map.segs){
    if(!index(seg.v1,map.vertexes.length)||!index(seg.v2,map.vertexes.length)||!index(seg.linedef,map.linedefs.length)||![0,1].includes(seg.side))fail('seg references');
    if(seg.side===1&&map.linedefs[seg.linedef].left<0)fail('seg back side');
  }
  for(const sub of map.subsectors)if(!Number.isInteger(sub.numSegs)||sub.numSegs<1||!index(sub.firstSeg,map.segs.length)||sub.firstSeg+sub.numSegs>map.segs.length)fail('subsector range');
  for(const node of map.nodes)for(const child of [node.rightChild,node.leftChild]){
    if(!Number.isInteger(child)||child<0||child>65535||!index(child&0x7fff,child&0x8000?map.subsectors.length:map.nodes.length))fail('BSP child');
  }
  // Iterative DFS also handles deep maps without overflowing the JS stack.
  const state=new Uint8Array(map.nodes.length);
  for(let root=0;root<map.nodes.length;root++){
    if(state[root])continue;
    const stack:[number,boolean][]=[[root,false]];
    while(stack.length){
      const [node,exit]=stack.pop()!;
      if(exit){state[node]=2;continue;}
      if(state[node]===1)fail('BSP cycle');if(state[node]===2)continue;
      state[node]=1;stack.push([node,true]);
      for(const child of [map.nodes[node].rightChild,map.nodes[node].leftChild])if(!(child&0x8000))stack.push([child,false]);
    }
  }
  if(!map.nodes.length&&map.subsectors.length!==1)fail('missing BSP nodes');
  if(map.blockmap.lists.length!==map.blockmap.columns*map.blockmap.rows)fail('BLOCKMAP dimensions');
  for(const list of map.blockmap.lists)for(const line of list)if(!index(line,map.linedefs.length))fail('BLOCKMAP linedef');
  if(map.reject&&map.reject.length<Math.ceil(map.sectors.length**2/8))fail('REJECT size');
}
