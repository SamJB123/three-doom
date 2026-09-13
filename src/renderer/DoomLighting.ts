import {DataTexture,RGBAFormat,SRGBColorSpace,NearestFilter,RepeatWrapping,MeshBasicMaterial,MeshBasicNodeMaterial,type MeshBasicMaterialParameters,type Material} from 'three/webgpu';
import {uniform,materialReference,texture,vec2,vec4,positionView,normalWorld} from 'three/tsl';
import type {PlayerStatusState} from '../ecs/traits';
import type {TextureData,SpriteFrame} from '../wad';
export type LightSurface='sprite'|'wall'|'flat';
// R_InitLightTables / R_ExecuteSetViewSize, normalized to the original 320-wide
// view. Depth is in map units. Three.js perspective/free look remain adaptations.
export function distanceColormap(light:number,depth:number,extraLight=0,bias=0,surface:LightSurface='sprite'):number {
  const level=Math.max(0,Math.min(15,(light>>4)+extraLight+bias));
  const scale=surface==='flat'
    ?Math.floor(160/(Math.min(127,Math.floor(Math.max(0,depth)/16))+1))
    :Math.min(47,Math.floor(2560/Math.max(depth,0.001)));
  return Math.max(0,Math.min(31,(15-level)*4-Math.floor(scale/2)));
}
export function wallLightBias(dx:number,dy:number):number {return dy===0?-1:dx===0?1:0;}


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
  return fixed.value>=0?fixed.value:bright?0:distanceColormap(light,0,extra.value);
}
export function indexedTexture(data:TextureData|SpriteFrame,enabled=!!atlas):DataTexture|null {
  if(!enabled||!data.indices)return null;
  const rgba=new Uint8Array(data.width*data.height*4);
  for(let i=0;i<data.indices.length;i++)rgba.set([data.indices[i],0,0,data.rgba[i*4+3]],i*4);
  const result=new DataTexture(rgba,data.width,data.height,RGBAFormat);
  result.magFilter=result.minFilter=NearestFilter;result.wrapS=result.wrapT=RepeatWrapping;result.needsUpdate=true;return result;
}
export function litMaterial(params:MeshBasicMaterialParameters,light:number,bright=false,lookup=atlas,surface:LightSurface='sprite'):MeshBasicMaterial|MeshBasicNodeMaterial {
  if(!lookup)return new MeshBasicMaterial(params);
  const material=new MeshBasicNodeMaterial(params),base=uniform(light),full=uniform(bright?1:0);
  const sample=vec4(materialReference('map','texture'));
  // Map X/Y correspond to world X/-Z; opposing faces share the same bias.
  const bias=surface==='wall'?normalWorld.x.abs().greaterThan(0.99999).select(1,normalWorld.z.abs().greaterThan(0.99999).select(-1,0)):uniform(0);
  const level=base.div(16).floor().add(extra).add(bias).clamp(0,15);
  const depth=positionView.z.negate().mul(32).max(0.001);
  const scale=surface==='flat'
    ?depth.div(16).floor().min(127).add(1).reciprocal().mul(160).floor()
    :depth.reciprocal().mul(2560).floor().min(47);
  const shade=level.negate().add(15).mul(4).sub(scale.div(2).floor()).clamp(0,31);
  const ordinary=full.greaterThan(0).select(0,shade);
  const row=fixed.greaterThanEqual(0).select(fixed,ordinary);
  material.colorNode=texture(lookup,vec2(sample.r.mul(255).add(0.5).div(256),row.add(0.5).div(34))).rgb;
  material.opacityNode=sample.a;
  material.userData.doomLight=base;material.userData.doomBright=full;
  return material;
}
export function updateMaterialLight(material:Material,light:number,bright=false):void {
  if(material.userData.doomLight){material.userData.doomLight.value=light;material.userData.doomBright.value=bright?1:0;}
}
export function spriteColors(frame:SpriteFrame,index:number):Uint8Array {
  if(!palette||!colormaps||!frame.indices)return frame.rgba;
  const rgba=new Uint8Array(frame.rgba.length),table=colormaps[index];
  for(let i=0;i<frame.indices.length;i++){
    const color=table[frame.indices[i]];rgba.set([palette[color*3],palette[color*3+1],palette[color*3+2],frame.rgba[i*4+3]],i*4);
  }
  return rgba;
}
