// Doom stair builder — ported from p_floor.c EV_BuildStairs.
// Walks adjacent sectors with matching floor textures to build staircases.

import type { Linedef, Sidedef, Sector } from '../wad';
import { movePlane } from './SectorHelpers';
import { addThinker, markSectorDirty } from './Thinkers';

export type StairType = 'build8' | 'turbo16';

const ML_TWOSIDED = 0x0004;

interface StairMove {
  sectorIdx: number;
  direction: number;
  speed: number;
  destHeight: number;
}

const activeStairSectors = new Set<number>();

function makeStairThinker( sm: StairMove, sectors: Sector[] ): () => boolean {

  return () => {

    markSectorDirty( sm.sectorIdx );
    const sector = sectors[ sm.sectorIdx ];

    const res = movePlane( sector, sm.speed, sm.destHeight, false, 0, sm.direction );

    if ( res === 'pastdest' ) {

      activeStairSectors.delete( sm.sectorIdx );
      return false;

    }

    return true;

  };

}

// EV_BuildStairs — build a staircase from tagged sectors
export function evBuildStairs(
  type: StairType,
  tag: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): boolean {

  let activated = false;

  for ( let secNum = 0; secNum < sectors.length; secNum ++ ) {

    if ( sectors[ secNum ].tag !== tag ) continue;
    if ( activeStairSectors.has( secNum ) ) continue;

    activated = true;

    const stairSize = type === 'build8' ? 8 : 16;
    const speed = type === 'build8' ? 0.25 : 4; // FRACUNIT/4 or FRACUNIT*4

    let currentSectorIdx = secNum;
    let height = sectors[ currentSectorIdx ].floorHeight + stairSize;
    const texture = sectors[ currentSectorIdx ].floorTex;

    // Spawn first step
    activeStairSectors.add( currentSectorIdx );
    addThinker( makeStairThinker( {
      sectorIdx: currentSectorIdx,
      direction: 1,
      speed,
      destHeight: height
    }, sectors ) );

    // Walk two-sided linedefs to find adjacent sectors with matching floor texture
    let searching = true;

    while ( searching ) {

      searching = false;

      for ( const ld of linedefs ) {

        if ( ( ld.flags & ML_TWOSIDED ) === 0 ) continue;
        if ( ld.left < 0 ) continue;

        const frontSectorIdx = sidedefs[ ld.right ].sector;
        if ( frontSectorIdx !== currentSectorIdx ) continue;

        const backSectorIdx = sidedefs[ ld.left ].sector;
        const nextSector = sectors[ backSectorIdx ];

        if ( nextSector.floorTex !== texture ) continue;
        if ( activeStairSectors.has( backSectorIdx ) ) continue;

        height += stairSize;
        currentSectorIdx = backSectorIdx;

        activeStairSectors.add( currentSectorIdx );
        addThinker( makeStairThinker( {
          sectorIdx: currentSectorIdx,
          direction: 1,
          speed,
          destHeight: height
        }, sectors ) );

        searching = true;
        break;

      }

    }

  }

  return activated;

}
