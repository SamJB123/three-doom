import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,MeshBasicMaterial} from 'three/webgpu';
import {initMobjSystem,spawnMobj,removeMobj,resetMobjs} from '../src/game/Mobj';
import {resetThinkers} from '../src/game/Thinkers';
import {dividedMap} from './fixtures/maps';

test('removing actors releases owned materials once and retains shared textures until level teardown',()=>{
  resetThinkers();resetMobjs();
  const group=new Group();
  initMobjSystem({PUFFA0:{width:1,height:1,leftOffset:0,topOffset:0,rgba:new Uint8Array([255,255,255,255])}},group,dividedMap());
  const first=spawnMobj(0,0,0,'MT_PUFF'),second=spawnMobj(0,0,0,'MT_PUFF');
  assert.ok(first.mesh);assert.ok(second.mesh);
  const material=first.mesh.material as MeshBasicMaterial,other=second.mesh.material as MeshBasicMaterial;
  assert.notEqual(material,other);assert.equal(material.map,other.map);
  let materials=0,textures=0,geometry=0;
  material.addEventListener('dispose',()=>materials++);
  material.map!.addEventListener('dispose',()=>textures++);
  first.mesh.geometry.addEventListener('dispose',()=>geometry++);
  removeMobj(first);removeMobj(first);
  assert.equal(materials,1);assert.equal(geometry,1);assert.equal(textures,0);
  assert.equal(group.children.length,1);
  other.addEventListener('dispose',()=>materials++);
  resetMobjs();resetThinkers();
  assert.equal(materials,2);assert.equal(textures,1);assert.equal(group.children.length,0);
});
