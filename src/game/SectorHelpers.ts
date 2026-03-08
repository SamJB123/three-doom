// Sector neighbor queries and T_MovePlane
// Ported from p_floor.c (T_MovePlane) and p_spec.c (sector height lookups)

import type { Sector, Linedef, Sidedef } from '../wad';

export type MovePlaneResult = 'ok' | 'crushed' | 'pastdest';

// T_MovePlane — generic sector plane mover
// Ported from p_floor.c lines 49-203
export function movePlane(
  sector: Sector,
  speed: number,
  dest: number,
  crush: boolean,
  floorOrCeiling: number, // 0 = floor, 1 = ceiling
  direction: number       // 1 = up, -1 = down
): MovePlaneResult {

  if ( floorOrCeiling === 0 ) {

    // Moving the floor
    if ( direction === - 1 ) {

      // Floor moving down
      if ( sector.floorHeight - speed < dest ) {

        sector.floorHeight = dest;
        return 'pastdest';

      }

      sector.floorHeight -= speed;

    } else {

      // Floor moving up
      if ( sector.floorHeight + speed > dest ) {

        sector.floorHeight = dest;
        return 'pastdest';

      }

      // Check for crushing against ceiling
      if ( sector.floorHeight + speed > sector.ceilingHeight ) {

        return crush ? 'crushed' : 'pastdest';

      }

      sector.floorHeight += speed;

    }

  } else {

    // Moving the ceiling
    if ( direction === - 1 ) {

      // Ceiling moving down
      if ( sector.ceilingHeight - speed < dest ) {

        sector.ceilingHeight = dest;
        return 'pastdest';

      }

      // Check for crushing against floor
      if ( sector.ceilingHeight - speed < sector.floorHeight ) {

        if ( crush ) {

          sector.ceilingHeight -= speed;
          return 'crushed';

        }

        sector.ceilingHeight = sector.floorHeight;
        return 'pastdest';

      }

      sector.ceilingHeight -= speed;

    } else {

      // Ceiling moving up
      if ( sector.ceilingHeight + speed > dest ) {

        sector.ceilingHeight = dest;
        return 'pastdest';

      }

      sector.ceilingHeight += speed;

    }

  }

  return 'ok';

}

// Find sectors neighboring a given sector via shared two-sided linedefs
export function getNeighborSectors(
  sectorIdx: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): Sector[] {

  const neighbors: Sector[] = [];
  const seen = new Set<number>();

  for ( const ld of linedefs ) {

    if ( ld.left < 0 ) continue; // one-sided

    const frontSectorIdx = sidedefs[ ld.right ].sector;
    const backSectorIdx = sidedefs[ ld.left ].sector;

    if ( frontSectorIdx === sectorIdx && ! seen.has( backSectorIdx ) ) {

      seen.add( backSectorIdx );
      neighbors.push( sectors[ backSectorIdx ] );

    } else if ( backSectorIdx === sectorIdx && ! seen.has( frontSectorIdx ) ) {

      seen.add( frontSectorIdx );
      neighbors.push( sectors[ frontSectorIdx ] );

    }

  }

  return neighbors;

}

// Find the lowest floor height among neighboring sectors
export function getLowestFloorHeight(
  sectorIdx: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): number {

  const neighbors = getNeighborSectors( sectorIdx, linedefs, sidedefs, sectors );
  let lowest = Infinity;

  for ( const s of neighbors ) {

    if ( s.floorHeight < lowest ) lowest = s.floorHeight;

  }

  return lowest === Infinity ? sectors[ sectorIdx ].floorHeight : lowest;

}

// Find the highest floor height among neighboring sectors
export function getHighestFloorHeight(
  sectorIdx: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): number {

  const neighbors = getNeighborSectors( sectorIdx, linedefs, sidedefs, sectors );
  let highest = - Infinity;

  for ( const s of neighbors ) {

    if ( s.floorHeight > highest ) highest = s.floorHeight;

  }

  return highest === - Infinity ? sectors[ sectorIdx ].floorHeight : highest;

}

// Find the next highest floor above the sector's current floor
export function getNextHighestFloor(
  sectorIdx: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): number {

  const neighbors = getNeighborSectors( sectorIdx, linedefs, sidedefs, sectors );
  const currentFloor = sectors[ sectorIdx ].floorHeight;
  let next = Infinity;

  for ( const s of neighbors ) {

    if ( s.floorHeight > currentFloor && s.floorHeight < next ) {

      next = s.floorHeight;

    }

  }

  return next === Infinity ? currentFloor : next;

}

// Find the lowest ceiling height among neighboring sectors
export function getLowestCeilingHeight(
  sectorIdx: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): number {

  const neighbors = getNeighborSectors( sectorIdx, linedefs, sidedefs, sectors );
  let lowest = Infinity;

  for ( const s of neighbors ) {

    if ( s.ceilingHeight < lowest ) lowest = s.ceilingHeight;

  }

  return lowest === Infinity ? sectors[ sectorIdx ].ceilingHeight : lowest;

}

// Find the highest ceiling height among neighboring sectors
export function getHighestCeilingHeight(
  sectorIdx: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): number {

  const neighbors = getNeighborSectors( sectorIdx, linedefs, sidedefs, sectors );
  let highest = - Infinity;

  for ( const s of neighbors ) {

    if ( s.ceilingHeight > highest ) highest = s.ceilingHeight;

  }

  return highest === - Infinity ? sectors[ sectorIdx ].ceilingHeight : highest;

}

// Find the sector index for a given sector object
export function findSectorIndex( sector: Sector, sectors: Sector[] ): number {

  return sectors.indexOf( sector );

}

// Get all sectors with a given tag
export function getSectorsWithTag( tag: number, sectors: Sector[] ): number[] {

  const result: number[] = [];

  for ( let i = 0; i < sectors.length; i ++ ) {

    if ( sectors[ i ].tag === tag ) result.push( i );

  }

  return result;

}
