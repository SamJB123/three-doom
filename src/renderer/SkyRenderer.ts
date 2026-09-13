import {Mesh,Group,SphereGeometry,MeshBasicNodeMaterial,DataTexture,RGBAFormat,NearestFilter,RepeatWrapping,ClampToEdgeWrapping,BackSide,DoubleSide,Color} from 'three/webgpu';
import {positionWorld,cameraPosition,atan,vec2,texture} from 'three/tsl';
import type {TextureData} from '../wad/types';

/** Shared directional projection for the background and depth-writing sky portals.
 * Four horizontal repeats and row 100 at the horizon follow R_DrawPlanes.
 * Free-look extends edge rows at the poles instead of exposing a finite sky mesh.
 */
export function createSkyMaterial(data:TextureData,portal=false):MeshBasicNodeMaterial {
  const tex=new DataTexture(data.rgba,data.width,data.height,RGBAFormat);
  tex.magFilter=tex.minFilter=NearestFilter;tex.wrapS=RepeatWrapping;tex.wrapT=ClampToEdgeWrapping;tex.needsUpdate=true;
  const direction=positionWorld.sub(cameraPosition);
  const horizontal=direction.xz.length().max(0.00001);
  const u=atan(direction.x,direction.z).div(2*Math.PI).mul(4);
  const v=direction.y.div(horizontal).mul(-160/data.height).add(100/data.height).clamp(0.5/data.height,1-0.5/data.height);
  const material=new MeshBasicNodeMaterial({side:portal?DoubleSide:BackSide,depthWrite:portal,depthTest:portal,fog:false});
  material.map=tex;material.colorNode=texture(tex,vec2(u,v)).rgb;
  material.name=portal?'Doom sky portal':'Doom sky background';
  return material;
}
export interface SkyInfo {mesh:Group;topColor:Color;}
export function createSky(data:TextureData):SkyInfo {
  const group=new Group(),mesh=new Mesh(new SphereGeometry(1,32,16),createSkyMaterial(data));
  mesh.renderOrder=-10000;mesh.frustumCulled=false;group.add(mesh);
  return {mesh:group,topColor:new Color(data.rgba[0]/255,data.rgba[1]/255,data.rgba[2]/255)};
}
