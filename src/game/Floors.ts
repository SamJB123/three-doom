// Doom floor movement system
// Ported from p_floor.c

import type { Linedef, Sidedef, Sector } from '../wad';
import {
  movePlane,
  getLowestFloorHeight, getHighestFloorHeight,
  getNeighborSectors, getNextHighestFloor
} from './SectorHelpers';
import { addThinker, markSectorDirty, archivedThinker, busySectors } from './Thinkers';

const FLOORSPEED = 1; // FRACUNIT → 1 unit/tic

export type FloorType =
  | 'lowerFloor'
  | 'lowerFloorToLowest'
  | 'turboLower'
  | 'raiseFloor'
  | 'raiseFloorToNearest'
  | 'raiseFloor24'
  | 'raiseFloor24AndChange'
  | 'raiseFloorCrush'
  | 'raiseFloorTurbo'
  | 'raiseFloor512'
  | 'lowerAndChange' | 'raiseToTexture' | 'donutRaise';

export interface FloorMove {
  sectorIdx: number;
  type: FloorType;
  crush: boolean;
  direction: number;
  destHeight: number;
  speed: number;
  texture?: string;
  newSpecial?: number;
}

const activeFloorSectors = new Set<number>();
export function resetFloors(): void { activeFloorSectors.clear(); }

function makeFloorThinker( fm: FloorMove, sectors: Sector[] ): () => boolean {

  return archivedThinker(() => {

    const sector = sectors[ fm.sectorIdx ];
    markSectorDirty( fm.sectorIdx );

    const res = movePlane(
      sector, fm.speed, fm.destHeight, fm.crush, 0, fm.direction
    );

    if ( res === 'pastdest' ) {
      if(fm.texture!==undefined)sector.floorTex=fm.texture;
      if(fm.newSpecial!==undefined)sector.special=fm.newSpecial;

      activeFloorSectors.delete( fm.sectorIdx ); busySectors.delete(fm.sectorIdx);
      return false;

    }

    return true;

  }, 'floor', () => fm);

}

// EV_DoFloor — activate tagged floor movers
export function evDoFloor(
  type: FloorType,
  tag: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[],
  trigger?: Linedef
): boolean {

  let activated = false;

  for ( let i = 0; i < sectors.length; i ++ ) {

    if ( sectors[ i ].tag !== tag ) continue;
    if ( busySectors.has( i ) ) continue;

    activeFloorSectors.add( i ); busySectors.add(i);
    activated = true;

    const sector = sectors[ i ];
    let destHeight = sector.floorHeight;
    let direction = - 1;
    let speed = FLOORSPEED;
    let crush = false;
    let texture: string | undefined, newSpecial: number | undefined;

    switch ( type ) {

      case 'lowerFloor':
        destHeight = getHighestFloorHeight( i, linedefs, sidedefs, sectors );
        break;

      case 'lowerFloorToLowest':
        destHeight = getLowestFloorHeight( i, linedefs, sidedefs, sectors );
        break;

      case 'turboLower':
        speed = FLOORSPEED * 4;
        destHeight = getHighestFloorHeight( i, linedefs, sidedefs, sectors );
        if ( destHeight !== sector.floorHeight ) destHeight += 8;
        break;

      case 'lowerAndChange': {
        destHeight = getLowestFloorHeight( i, linedefs, sidedefs, sectors );
        const model=getNeighborSectors(i,linedefs,sidedefs,sectors).find(s=>s.floorHeight===destHeight);
        texture=model?.floorTex ?? sector.floorTex;newSpecial=model?.special ?? sector.special;
        break;
      }
      case 'raiseToTexture': {
        direction=1;
        let shortest=Infinity;
        for(const line of linedefs) {
          if(line.left<0)continue;
          if(sidedefs[line.left].sector!==i && sidedefs[line.right].sector!==i)continue;
          for(const side of [line.left,line.right]) {
            const height=floorTextureHeights[sidedefs[side].lower];
            if(height>0)shortest=Math.min(shortest,height);
          }
        }
        destHeight=sector.floorHeight+(Number.isFinite(shortest)?shortest:0);
        break;
      }

      case 'raiseFloor':
        direction = 1;
        destHeight = getLowestCeilingNeighbor( i, linedefs, sidedefs, sectors );
        if ( destHeight > sector.ceilingHeight ) destHeight = sector.ceilingHeight;
        break;

      case 'raiseFloorToNearest':
        direction = 1;
        destHeight = getNextHighestFloor( i, linedefs, sidedefs, sectors );
        break;

      case 'raiseFloor24':
        direction = 1;
        destHeight = sector.floorHeight + 24;
        break;

      case 'raiseFloor24AndChange':
        direction = 1;
        destHeight = sector.floorHeight + 24;
        if(trigger){const model=sectors[sidedefs[trigger.right].sector];sector.floorTex=model.floorTex;sector.special=model.special;}
        break;

      case 'raiseFloorCrush':
        direction = 1;
        crush = true;
        destHeight = Math.min(sector.ceilingHeight,getLowestCeilingNeighbor( i, linedefs, sidedefs, sectors )) - 8;
        break;

      case 'raiseFloorTurbo':
        direction = 1;
        speed = FLOORSPEED * 4;
        destHeight = getNextHighestFloor( i, linedefs, sidedefs, sectors );
        break;

      case 'raiseFloor512':
        direction = 1;
        destHeight = sector.floorHeight + 512;
        break;

    }

    const fm: FloorMove = {
      sectorIdx: i,...(texture!==undefined?{texture}:{}),...(newSpecial!==undefined?{newSpecial}:{}),
      type,
      crush,
      direction,
      destHeight,
      speed
    };

    addThinker( makeFloorThinker( fm, sectors ) );

  }

  return activated;

}

// Helper — just reuses getLowestCeilingHeight but we import under a different name
// to avoid a naming collision. This finds the lowest ceiling among neighbors.
import { getLowestCeilingHeight as getLowestCeilingNeighbor } from './SectorHelpers';

export function restoreFloors(state: FloorMove, sectors: Sector[]): void {
  activeFloorSectors.add(state.sectorIdx);busySectors.add(state.sectorIdx);
  addThinker(makeFloorThinker(state, sectors));
}

let floorTextureHeights: Record<string,number>={};
export function setFloorTextureHeights(heights: Record<string,number>): void {floorTextureHeights=heights;}
export function evDoDonut(tag: number, lines: Linedef[], sides: Sidedef[], sectors: Sector[]): boolean {
  let started=false;
  sectors.forEach((pillar,index)=>{
    if(pillar.tag!==tag||busySectors.has(index))return;
    const first=lines.find(l=>sides[l.right].sector===index || (l.left>=0 && sides[l.left].sector===index));
    if(!first || first.left<0)return;
    const ringIndex=sides[first.right].sector===index ? sides[first.left].sector : sides[first.right].sector;
    if(busySectors.has(ringIndex))return;
    const edge=lines.find(l=>l.left>=0 && (sides[l.right].sector===ringIndex || sides[l.left].sector===ringIndex) && sides[l.left].sector!==index && sides[l.left].sector!==ringIndex);
    if(!edge)return;
    const model=sectors[sides[edge.left].sector];
    restoreFloors({sectorIdx:ringIndex,type:'donutRaise',direction:1,speed:.5,destHeight:model.floorHeight,crush:false,texture:model.floorTex,newSpecial:0},sectors);
    restoreFloors({sectorIdx:index,type:'lowerFloor',direction:-1,speed:.5,destHeight:model.floorHeight,crush:false},sectors);
    started=true;
  });
  return started;
}
