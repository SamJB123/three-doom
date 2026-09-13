import {DataTexture,RGBAFormat,SRGBColorSpace,NearestFilter,RepeatWrapping,MeshBasicMaterial,MeshBasicNodeMaterial,type MeshBasicMaterialParameters,type Material} from 'three/webgpu';
import {uniform,materialReference,texture,vec2,vec4} from 'three/tsl';
import type {PlayerStatusState} from '../ecs/traits';
import type {TextureData,SpriteFrame} from '../wad';
import {lightLevelToColormapIndex} from '../wad/ColormapParser';

export function powerColormap(state:PlayerStatusState):number {
  const inv=state.powers.invulnerability,infra=state.powers.infrared;
  if(inv)return inv>128||(inv&8)?32:-1;
  if(infra)return infra>128||(infra&8)?1:-1;
  return -1;
}
let palette:Uint8Array|undefined,colormaps:Uint8Array[]|undefined,atlas:DataTexture|undefined;
const extra=uniform(0),fixed=uniform(-1);
export function createColorAtlas(colors:Uint8Array,tables:Uint8Array[]):DataTexture {
  const rgba=new Uint8Array(256*34*4);
  for(let row=0;row<34;row++)for(let i=0;i<256;i++){
    const index=(tables[row]??tables[0])[i];rgba.set([colors[index*3],colors[index*3+1],colors[index*3+2],255],(row*256+i)*4);
  }
  const result=new DataTexture(rgba,256,34,RGBAFormat);result.colorSpace=SRGBColorSpace;result.magFilter=result.minFilter=NearestFilter;result.needsUpdate=true;return result;
}
export function initDoomLighting(colors:Uint8Array,tables:Uint8Array[]):void {
  atlas?.dispose();palette=colors;colormaps=tables;atlas=createColorAtlas(colors,tables);
  extra.value=0;fixed.value=-1;
}
export function updateDoomLighting(state:PlayerStatusState,extraLight:number):void {extra.value=extraLight;fixed.value=powerColormap(state);}
export function lightingIndex(light:number,bright=false):number {
  return fixed.value>=0?fixed.value:bright?0:Math.max(0,lightLevelToColormapIndex(light)-extra.value*2);
}
export function indexedTexture(data:TextureData|SpriteFrame,enabled=!!atlas):DataTexture|null {
  if(!enabled||!data.indices)return null;
  const rgba=new Uint8Array(data.width*data.height*4);
  for(let i=0;i<data.indices.length;i++)rgba.set([data.indices[i],0,0,data.rgba[i*4+3]],i*4);
  const result=new DataTexture(rgba,data.width,data.height,RGBAFormat);
  result.magFilter=result.minFilter=NearestFilter;result.wrapS=result.wrapT=RepeatWrapping;result.needsUpdate=true;return result;
}
export function litMaterial(params:MeshBasicMaterialParameters,light:number,bright=false,lookup=atlas):MeshBasicMaterial|MeshBasicNodeMaterial {
  if(!lookup)return new MeshBasicMaterial(params);
  const material=new MeshBasicNodeMaterial(params),base=uniform(lightLevelToColormapIndex(light)),full=uniform(bright?1:0);
  const sample=vec4(materialReference('map','texture'));
  const ordinary=full.greaterThan(0).select(0,base.sub(extra.mul(2)).clamp(0,31));
  const row=fixed.greaterThanEqual(0).select(fixed,ordinary);
  material.colorNode=texture(lookup,vec2(sample.r.mul(255).add(0.5).div(256),row.add(0.5).div(34))).rgb;
  material.opacityNode=sample.a;
  material.userData.doomLight=base;material.userData.doomBright=full;
  return material;
}
export function updateMaterialLight(material:Material,light:number,bright=false):void {
  if(material.userData.doomLight){material.userData.doomLight.value=lightLevelToColormapIndex(light);material.userData.doomBright.value=bright?1:0;}
}
export function spriteColors(frame:SpriteFrame,index:number):Uint8Array {
  if(!palette||!colormaps||!frame.indices)return frame.rgba;
  const rgba=new Uint8Array(frame.rgba.length),table=colormaps[index];
  for(let i=0;i<frame.indices.length;i++){
    const color=table[frame.indices[i]];rgba.set([palette[color*3],palette[color*3+1],palette[color*3+2],frame.rgba[i*4+3]],i*4);
  }
  return rgba;
}
