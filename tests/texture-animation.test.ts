import test from 'node:test';
import assert from 'node:assert/strict';
import {TextureManager} from '../src/renderer/TextureManager';
import {textureAnimations,animationFrame} from '../src/renderer/TextureAnimations';
const texture=(index:number)=>({width:1,height:1,indices:new Uint8Array([index]),rgba:new Uint8Array([index,index,index,255])});
test('P_UpdateSpecials uses WAD directory frame ranges, absolute indices and eight-tic cadence',()=>{
  const lookup=textureAnimations(['PAD','NUKAGE1','NUKAGE2','NUKAGE3'],false);
  assert.equal(animationFrame(lookup.get('NUKAGE2')!,0),1);
  for(const [name,index] of [['NUKAGE1',1],['NUKAGE2',2],['NUKAGE3',0]] as const){
    assert.equal(animationFrame(lookup.get(name)!,1),index);
    assert.equal(animationFrame(lookup.get(name)!,8),index);
    assert.equal(animationFrame(lookup.get(name)!,9),(index+1)%3);
  }
  assert.throws(()=>textureAnimations(['NUKAGE1'],false),/Invalid animation/);
});
test('animated wall and flat materials translate globally, including materials created mid-level',()=>{
  const palette=new Uint8Array(768);for(let i=0;i<256;i++)palette.fill(i,i*3,i*3+3);
  const colormaps=Array.from({length:32},()=>Uint8Array.from({length:256},(_,i)=>i));
  const manager=new TextureManager({FIREBLU1:texture(40),FIREBLU2:texture(50)},
    {PAD:texture(0),NUKAGE1:texture(10),NUKAGE2:texture(20),NUKAGE3:texture(30)},colormaps,palette);
  const a=manager.getFlatMaterial('NUKAGE1',255)!,b=manager.getFlatMaterial('NUKAGE2',255)!,wall=manager.getWallMaterial('FIREBLU1',255)!;
  const pixel=(mat:typeof a)=>(mat.map!.image as any).data[0];
  assert.deepEqual([pixel(a),pixel(b),pixel(wall)],[10,20,40]);
  manager.updateAnimatedTextures(1);assert.deepEqual([pixel(a),pixel(b),pixel(wall)],[20,30,40]);
  manager.updateAnimatedTextures(9);assert.deepEqual([pixel(a),pixel(b),pixel(wall)],[30,10,50]);
  assert.equal(pixel(manager.getFlatMaterial('NUKAGE1',128)!),30);
  manager.updateAnimatedTextures(1);assert.deepEqual([pixel(a),pixel(b),pixel(wall)],[20,30,40]);
  manager.dispose();
});
