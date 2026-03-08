// Sector light specials — ported from p_lights.c / p_spec.c
// Fire flicker, strobe flash, and smooth glow effects.

import type { Sector, Linedef, Sidedef } from '../wad';
import { addThinker, markSectorDirty } from './Thinkers';
import { lightLevelToColormapIndex } from '../wad/ColormapParser';

// --- Constants from p_spec.h ---
const GLOWSPEED = 8;
const STROBEBRIGHT = 5;
const FASTDARK = 15;
const SLOWDARK = 35;

// --- P_FindMinSurroundingLight ---
// Scans all two-sided linedefs of a sector for the lowest neighboring light level.

function findMinSurroundingLight(
  sectorIdx: number,
  max: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): number {

  let min = max;

  for ( const ld of linedefs ) {

    if ( ld.left < 0 ) continue;

    const frontSi = sidedefs[ ld.right ].sector;
    const backSi = sidedefs[ ld.left ].sector;

    if ( frontSi === sectorIdx && sectors[ backSi ].lightLevel < min ) {

      min = sectors[ backSi ].lightLevel;

    } else if ( backSi === sectorIdx && sectors[ frontSi ].lightLevel < min ) {

      min = sectors[ frontSi ].lightLevel;

    }

  }

  return min;

}

// Helper: only mark dirty when the visible colormap band changes
function setLightLevel( sector: Sector, sectorIdx: number, newLevel: number ): void {

  const oldCm = lightLevelToColormapIndex( sector.lightLevel );
  sector.lightLevel = newLevel;
  const newCm = lightLevelToColormapIndex( newLevel );

  if ( oldCm !== newCm ) markSectorDirty( sectorIdx );

}

// --- Fire Flicker (sector types 1 & 17) ---

function spawnFireFlicker(
  sectorIdx: number,
  sectors: Sector[],
  linedefs: Linedef[],
  sidedefs: Sidedef[]
): void {

  const sector = sectors[ sectorIdx ];
  const maxlight = sector.lightLevel;
  const minlight = Math.min(
    maxlight,
    findMinSurroundingLight( sectorIdx, maxlight, linedefs, sidedefs, sectors ) + 16
  );
  let count = 4;

  addThinker( () => {

    if ( -- count > 0 ) return true;

    const amount = ( Math.floor( Math.random() * 4 ) ) * 16;
    const newLevel = Math.max( minlight, maxlight - amount );
    setLightLevel( sector, sectorIdx, newLevel );
    count = 4;
    return true;

  } );

}

// --- Strobe Flash (sector types 2, 3, 4, 12, 13) ---

function spawnStrobeFlash(
  sectorIdx: number,
  sectors: Sector[],
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  darkTime: number,
  inSync: boolean
): void {

  const sector = sectors[ sectorIdx ];
  const maxlight = sector.lightLevel;
  let minlight = findMinSurroundingLight( sectorIdx, maxlight, linedefs, sidedefs, sectors );

  if ( minlight === maxlight ) minlight = 0;

  let count = inSync ? 1 : ( Math.floor( Math.random() * 8 ) + 1 );

  addThinker( () => {

    if ( -- count > 0 ) return true;

    if ( sector.lightLevel === minlight ) {

      setLightLevel( sector, sectorIdx, maxlight );
      count = STROBEBRIGHT;

    } else {

      setLightLevel( sector, sectorIdx, minlight );
      count = darkTime;

    }

    return true;

  } );

}

// --- Glowing Light (sector type 8) ---

function spawnGlowingLight(
  sectorIdx: number,
  sectors: Sector[],
  linedefs: Linedef[],
  sidedefs: Sidedef[]
): void {

  const sector = sectors[ sectorIdx ];
  const maxlight = sector.lightLevel;
  const minlight = findMinSurroundingLight( sectorIdx, maxlight, linedefs, sidedefs, sectors );
  let direction = - 1;

  addThinker( () => {

    if ( direction === - 1 ) {

      const newLevel = sector.lightLevel - GLOWSPEED;

      if ( newLevel <= minlight ) {

        setLightLevel( sector, sectorIdx, sector.lightLevel + GLOWSPEED );
        direction = 1;

      } else {

        setLightLevel( sector, sectorIdx, newLevel );

      }

    } else {

      const newLevel = sector.lightLevel + GLOWSPEED;

      if ( newLevel >= maxlight ) {

        setLightLevel( sector, sectorIdx, sector.lightLevel - GLOWSPEED );
        direction = - 1;

      } else {

        setLightLevel( sector, sectorIdx, newLevel );

      }

    }

    return true;

  } );

}

// --- Spawn all sector light specials ---

export function spawnLightSpecials(
  sectors: Sector[],
  linedefs: Linedef[],
  sidedefs: Sidedef[]
): void {

  for ( let si = 0; si < sectors.length; si ++ ) {

    switch ( sectors[ si ].special ) {

      case 1:  // Flickering lights
      case 17: // Fire flicker
        spawnFireFlicker( si, sectors, linedefs, sidedefs );
        break;

      case 2:  // Strobe fast (unsynchronized)
        spawnStrobeFlash( si, sectors, linedefs, sidedefs, FASTDARK, false );
        break;

      case 3:  // Strobe slow (unsynchronized)
        spawnStrobeFlash( si, sectors, linedefs, sidedefs, SLOWDARK, false );
        break;

      case 4:  // Strobe fast + damage (same light effect as type 2)
        spawnStrobeFlash( si, sectors, linedefs, sidedefs, FASTDARK, false );
        break;

      case 8:  // Glowing light
        spawnGlowingLight( si, sectors, linedefs, sidedefs );
        break;

      case 12: // Sync strobe slow
        spawnStrobeFlash( si, sectors, linedefs, sidedefs, SLOWDARK, true );
        break;

      case 13: // Sync strobe fast
        spawnStrobeFlash( si, sectors, linedefs, sidedefs, FASTDARK, true );
        break;

    }

  }

}
