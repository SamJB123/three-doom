import {validateMap} from '../wad/MapValidation';
import {linkThing} from '../physics/ThingLinks';
import {P_Random} from './DoomRandom';
import { Group, Mesh, MeshBasicMaterial } from 'three/webgpu';
import * as w from '../wad';
import { buildScene } from '../renderer/SceneBuilder';
import { buildThingSprites, disposeThingSprites } from '../renderer/SpriteRenderer';
import { createSky } from '../renderer/SkyRenderer';
import { createPlayer, findSectorAt, type DoomMapData } from '../physics/DoomMovement';
import { intToFixed } from '../math/fixed';
import { allMobjs, initMobjSystem, resetMobjs, spawnMapThing, restoreMobjThinker } from './Mobj';
import { DOOMEDNUM_TO_TYPE, MF_COUNTKILL } from './MobjData';
import { initEnemyAI, setPlayerMobj } from './EnemyAI';
import { initAttackSystem, setAttackMap } from './Attack';
import { resetThinkers } from './Thinkers';
import { resetDoors } from './Doors';
import { resetFloors, setFloorTextureHeights } from './Floors';
import { resetPlatforms } from './Platforms';
import { resetCeilings } from './Ceilings';
import { resetStairs } from './Stairs';
import { resetUseActions } from './UseAction';
import { consumeTeleport } from './Teleport';
import { computeSectorSoundOrigins } from './SectorHelpers';
import { spawnLightSpecials } from './Lights';
import { gameRules, shouldSpawnThing, type Skill } from './GameRules';
import { skyTexture } from './Campaign';

export interface LevelAssets {
  palette: w.Palette;
  colormap: Uint8Array[];
  flats: Record<string,w.TextureData>;
  textures: Record<string,w.TextureData>;
  sprites: Record<string,w.SpriteFrame>;
}

export class Level {
  readonly root = new Group();
  readonly map: DoomMapData;
  readonly things: w.Thing[];
  readonly player: ReturnType<typeof createPlayer>;
  readonly sprites: Group;
  readonly manager: ReturnType<typeof buildScene>['manager'];
  readonly sky: ReturnType<typeof createSky>['mesh'] | null;
  readonly startYaw: number;
  readonly totalKills: number;
  readonly totalSecrets: number;
  kills = 0;
  secrets = 0;
  items = 0;

  constructor(wad: w.WAD, assets: LevelAssets, readonly episode: number, readonly number: number, skill: Skill) {
    Object.assign(gameRules,{episode,map:number,skill});
    resetThinkers(); resetMobjs(); resetDoors(); resetFloors(); resetPlatforms(); resetCeilings(); resetStairs();
    resetUseActions(); consumeTeleport();
    const lumps=w.getMapLumps(wad,`E${episode}M${number}`);
    const map: DoomMapData = {
      vertexes:w.parseVertexes(wad,lumps.VERTEXES), linedefs:w.parseLinedefs(wad,lumps.LINEDEFS),
      sidedefs:w.parseSidedefs(wad,lumps.SIDEDEFS), sectors:w.parseSectors(wad,lumps.SECTORS),
      segs:w.parseSegs(wad,lumps.SEGS), subsectors:w.parseSubsectors(wad,lumps.SSECTORS),
      nodes:w.parseNodes(wad,lumps.NODES), blockmap:w.parseBlockmap(wad,lumps.BLOCKMAP),
      reject:wad.buf.slice(lumps.REJECT.offset,lumps.REJECT.offset+lumps.REJECT.size)
    };
    validateMap(map);
    this.map=map;
    setFloorTextureHeights(Object.fromEntries(Object.entries(assets.textures).map(([name,texture])=>[name,texture.height])));
    this.things=w.parseThings(wad,lumps.THINGS).filter(t=>shouldSpawnThing(t,skill));
    this.totalSecrets=map.sectors.filter(s=>s.special===9).length;
    computeSectorSoundOrigins(map.sectors,map.linedefs,map.sidedefs,map.vertexes);
    const scene=buildScene(map.vertexes,map.linedefs,map.sidedefs,map.sectors,this.things,assets.textures,assets.flats,assets.colormap,assets.palette,assets.textures[skyTexture(episode)]);
    this.manager=scene.manager; this.root.add(scene.group);
    this.sky=assets.textures[skyTexture(episode)] ? createSky(assets.textures[skyTexture(episode)]).mesh : null;
    if (this.sky) this.root.add(this.sky);
    this.sprites=buildThingSprites(this.things,assets.sprites,map,new Set(Object.keys(DOOMEDNUM_TO_TYPE).map(Number)));
    this.root.add(this.sprites);
    initMobjSystem(assets.sprites,this.sprites,map); initAttackSystem(); setAttackMap(map); initEnemyAI();
    const start=this.things.find(t=>t.type===1);
    if (!start) throw new Error(`E${episode}M${number} has no player start`);
    const sector=findSectorAt(start.x,start.y,map)!;
    this.player=createPlayer(start.x,start.y,sector.floorHeight);
    this.player.mo.ceilingz=intToFixed(sector.ceilingHeight);
    this.player.mo.sectorIndex=map.sectors.indexOf(sector);
    this.player.mo.angle=start.angle*Math.PI/180;
    this.startYaw=this.player.mo.angle-Math.PI/2;
    setPlayerMobj(this.player.mo);
    for(const thing of this.things){
      if(thing===start){this.player.mo.lastLook=P_Random()%4;allMobjs.push(this.player.mo);linkThing(this.player.mo,map);restoreMobjThinker(this.player.mo);}
      else if(DOOMEDNUM_TO_TYPE[thing.type])spawnMapThing(thing);
    }
    this.totalKills=allMobjs.filter(m=>m.flags&MF_COUNTKILL).length;
    spawnLightSpecials(map.sectors,map.linedefs,map.sidedefs);
  }

  dispose(): void {
    resetThinkers(); resetMobjs(); this.manager.dispose(); disposeThingSprites(this.sprites);
    this.sky?.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials as MeshBasicMaterial[]) {
        material.map?.dispose(); material.dispose();
      }
    });
    this.root.clear(); this.root.removeFromParent();
  }
}
