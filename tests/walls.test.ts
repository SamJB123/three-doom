import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,FrontSide} from 'three/webgpu';
import {SceneManager} from '../src/renderer/SceneBuilder';

function fixture({backCeiling=0,flags=0,middle='-',yoff=0,height=128}={}) {
  const sectors=[{floorHeight:0,ceilingHeight:128,floorTex:'-',ceilingTex:'-',lightLevel:255,special:0,tag:0},{floorHeight:0,ceilingHeight:backCeiling,floorTex:'-',ceilingTex:'-',lightLevel:255,special:0,tag:0}];
  const sides=[0,1].map(sector=>({sector,xoff:0,yoff,upper:'TEST',lower:'-',middle}));
  const texture={width:64,height,indices:new Uint8Array(64*height),rgba:new Uint8Array(64*height*4).fill(255)};
  const manager=new SceneManager([{x:0,y:0},{x:64,y:0}],[{v1:0,v2:1,right:0,left:1,flags,special:0,tag:0}],sides,sectors,{TEST:texture},{},Array.from({length:32},()=>new Uint8Array(256)),new Uint8Array(768));
  const meshes:Mesh[]=[];manager.root.traverse(object=>{if(object instanceof Mesh)meshes.push(object);});
  return {manager,meshes};
}

test('ordinary door upper texture follows moving ceiling; DONTPEGTOP holds it stationary',()=>{
  for(const flags of [0,8]){
    const closed=fixture({flags}),open=fixture({flags,backCeiling:32});
    const a=closed.meshes[0].geometry.getAttribute('uv'),b=open.meshes[0].geometry.getAttribute('uv');
    // Row at stationary room ceiling moves by 32 texture pixels for normal
    // doors. The bottom stays on the texture's bottom row as the door rises.
    assert.equal(b.getY(0)-a.getY(0),flags===0?32/128:0);
    if(flags===0)assert.equal(b.getY(1),1);
    assert.equal(closed.meshes[0].geometry.getAttribute('normal').getZ(0),1);
    closed.manager.dispose();open.manager.dispose();
  }
});

test('masked grates cull the opposite side, discard holes and clip one vertical texture',()=>{
  const {manager,meshes}=fixture({backCeiling:128,middle:'TEST',height:64,yoff:-16});
  assert.equal(meshes.length,1);
  const mesh=meshes[0],material=mesh.material as any;
  assert.equal(material.side,FrontSide);assert.equal(material.alphaTest,0.5);assert.equal(material.transparent,false);
  const positions=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv'),normal=mesh.geometry.getAttribute('normal');
  assert.equal(positions.count,12);
  assert.equal(normal.getZ(0),1);assert.equal(normal.getZ(6),-1);
  assert.equal(positions.getY(0),112/32);assert.equal(positions.getY(1),48/32);
  assert.equal(uv.getY(0),0);assert.equal(uv.getY(1),1);
  manager.dispose();
});
