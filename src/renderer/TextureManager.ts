import {
  DataTexture, RGBAFormat, NearestFilter, RepeatWrapping,
  MeshBasicMaterial, Color, DoubleSide, FrontSide
} from 'three/webgpu';
import type { TextureData, Palette } from '../wad/types';
import { lightLevelToColormapIndex } from '../wad/ColormapParser';

import {textureAnimations,animationFrame,type TextureAnimation} from './TextureAnimations';

interface AnimatedEntry {
  material: MeshBasicMaterial;
  textures: DataTexture[];  // pre-built textures for each frame in the sequence
  animation: TextureAnimation;
  lastFrame: number;        // last frame index applied (avoid redundant swaps)
}

export class TextureManager {

  private wallCache = new Map<string, MeshBasicMaterial>();
  private flatCache = new Map<string, MeshBasicMaterial>();
  private animated: AnimatedEntry[] = [];
  private flatAnimations:Map<string,TextureAnimation>;
  private wallAnimations:Map<string,TextureAnimation>;
  private completedTics=0;

  readonly wallTextures: Record<string, TextureData>;

  constructor(
    wallTextures: Record<string, TextureData>,
    private flats: Record<string, TextureData>,
    private colormap: Uint8Array[],
    private palette: Palette
  ) {

    this.wallTextures = wallTextures;
    this.flatAnimations=textureAnimations(Object.keys(flats),false);
    this.wallAnimations=textureAnimations(Object.keys(wallTextures),true);

  }

  dispose(): void {
    const materials=new Set([...this.wallCache.values(),...this.flatCache.values()]);
    const textures=new Set<DataTexture>();
    for (const material of materials) { if (material.map) textures.add(material.map as DataTexture); material.dispose(); }
    for (const entry of this.animated) for (const texture of entry.textures) textures.add(texture);
    for (const texture of textures) texture.dispose();
    this.wallCache.clear(); this.flatCache.clear(); this.animated.length=0;
  }

  private makeColormappedTexture( texData: TextureData, lightLevel: number ): DataTexture {

    const cmIndex = lightLevelToColormapIndex( lightLevel );
    const table = this.colormap[ cmIndex ];
    const { width, height, indices } = texData;
    const rgba = new Uint8Array( width * height * 4 );

    for ( let i = 0; i < width * height; i ++ ) {

      // If original pixel was transparent (alpha=0), keep it transparent
      if ( texData.rgba[ i * 4 + 3 ] === 0 ) continue;

      const mappedIdx = table[ indices[ i ] ];
      rgba[ i * 4 ] = this.palette[ mappedIdx * 3 ];
      rgba[ i * 4 + 1 ] = this.palette[ mappedIdx * 3 + 1 ];
      rgba[ i * 4 + 2 ] = this.palette[ mappedIdx * 3 + 2 ];
      rgba[ i * 4 + 3 ] = 255;

    }

    const tex = new DataTexture( rgba, width, height, RGBAFormat );
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestFilter;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.needsUpdate = true;
    return tex;

  }

  getWallMaterial( texName: string, lightLevel: number, masked = false ): MeshBasicMaterial | null {

    if ( ! texName || texName === '-' ) return null;

    const key = texName + '_' + lightLevel + '_' + masked;
    const cached = this.wallCache.get( key );
    if ( cached ) return cached;

    const texData = this.wallTextures[ texName ];

    if ( ! texData ) {

      const cmIndex = lightLevelToColormapIndex( lightLevel );
      const brightness = 1 - cmIndex / 31;
      const mat = new MeshBasicMaterial( {
        color: new Color( brightness * 0.5, brightness * 0.4, brightness * 0.3 ),
        side: FrontSide
      } );
      this.wallCache.set( key, mat );
      return mat;

    }

    const tex = this.makeColormappedTexture( texData, lightLevel );
    const mat = new MeshBasicMaterial( {
      map: tex,
      side: FrontSide,
      transparent: false,
      alphaTest: masked ? 0.5 : 0
    } );
    this.wallCache.set( key, mat );
    this.registerAnimation(mat,texName,lightLevel,true);
    return mat;

  }

  getFlatMaterial( texName: string, lightLevel: number ): MeshBasicMaterial | null {

    if ( ! texName || texName === '-' ) return null;

    const key = texName + '_' + lightLevel;
    const cached = this.flatCache.get( key );
    if ( cached ) return cached;

    const texData = this.flats[ texName ];

    if ( ! texData ) {

      const cmIndex = lightLevelToColormapIndex( lightLevel );
      const brightness = 1 - cmIndex / 31;
      const mat = new MeshBasicMaterial( {
        color: new Color( brightness * 0.4, brightness * 0.5, brightness * 0.4 ),
        side: DoubleSide
      } );
      this.flatCache.set( key, mat );
      return mat;

    }

    const tex = this.makeColormappedTexture( texData, lightLevel );
    const mat = new MeshBasicMaterial( {
      map: tex,
      side: DoubleSide
    } );
    this.flatCache.set( key, mat );

    this.registerAnimation(mat,texName,lightLevel,false);

    return mat;

  }

  private registerAnimation(material:MeshBasicMaterial,name:string,light:number,wall:boolean):void {
    const animation=(wall?this.wallAnimations:this.flatAnimations).get(name);
    if(!animation)return;
    const source=wall?this.wallTextures:this.flats;
    const textures=animation.frames.map(frame=>frame===name ? material.map as DataTexture : this.makeColormappedTexture(source[frame],light));
    const entry={material,textures,animation,lastFrame:animation.initial};
    this.animated.push(entry);
    this.applyAnimation(entry);
  }

  private applyAnimation(entry:AnimatedEntry):void {
    const index=animationFrame(entry.animation,this.completedTics);
    if(index===entry.lastFrame)return;
    entry.material.map=entry.textures[index];
    entry.lastFrame=index;
  }

  /** Called at the render boundary using the authoritative completed tic count. */
  updateAnimatedTextures(completedTics:number):void {
    this.completedTics=completedTics;
    for(const entry of this.animated)this.applyAnimation(entry);
  }

}
