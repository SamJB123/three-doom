// Doom floor movement system
// Ported from p_floor.c

import type { Linedef, Sidedef, Sector } from '../wad';
import {
  movePlane,
  getLowestFloorHeight, getHighestFloorHeight,
  getNextHighestFloor
} from './SectorHelpers';
import { addThinker, markSectorDirty } from './Thinkers';

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
  | 'lowerAndChange';

interface FloorMove {
  sectorIdx: number;
  type: FloorType;
  crush: boolean;
  direction: number;
  destHeight: number;
  speed: number;
}

const activeFloorSectors = new Set<number>();

function makeFloorThinker( fm: FloorMove, sectors: Sector[] ): () => boolean {

  return () => {

    const sector = sectors[ fm.sectorIdx ];
    markSectorDirty( fm.sectorIdx );

    const res = movePlane(
      sector, fm.speed, fm.destHeight, fm.crush, 0, fm.direction
    );

    if ( res === 'pastdest' ) {

      activeFloorSectors.delete( fm.sectorIdx );
      return false;

    }

    return true;

  };

}

// EV_DoFloor — activate tagged floor movers
export function evDoFloor(
  type: FloorType,
  tag: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): boolean {

  let activated = false;

  for ( let i = 0; i < sectors.length; i ++ ) {

    if ( sectors[ i ].tag !== tag ) continue;
    if ( activeFloorSectors.has( i ) ) continue;

    activeFloorSectors.add( i );
    activated = true;

    const sector = sectors[ i ];
    let destHeight = sector.floorHeight;
    let direction = - 1;
    let speed = FLOORSPEED;
    let crush = false;

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

      case 'lowerAndChange':
        destHeight = getLowestFloorHeight( i, linedefs, sidedefs, sectors );
        break;

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
        break;

      case 'raiseFloorCrush':
        direction = 1;
        crush = true;
        destHeight = getLowestCeilingNeighbor( i, linedefs, sidedefs, sectors ) - 8;
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
      sectorIdx: i,
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
