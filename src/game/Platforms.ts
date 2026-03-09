// Doom platform/lift system — sectors whose floors move up and down.
// Ported from p_plats.c

import type { Linedef, Sidedef, Sector } from '../wad';
import { movePlane, getLowestFloorHeight, getHighestFloorHeight } from './SectorHelpers';
import { addThinker, markSectorDirty } from './Thinkers';
import { playSoundAt } from '../sound';
import { intToFixed } from '../math/fixed';

// p_spec.h constants
const PLATSPEED = 1;  // FRACUNIT → 1 unit/tic
const PLATWAIT = 3;   // 3 seconds → 3 * 35 = 105 tics

export type PlatType =
  | 'downWaitUpStay'
  | 'blazeDWUS'
  | 'perpetualRaise'
  | 'raiseAndChange'
  | 'raiseToNearestAndChange';

type PlatStatus = 'up' | 'down' | 'waiting';

interface Plat {
  sectorIdx: number;
  type: PlatType;
  speed: number;
  low: number;
  high: number;
  wait: number;
  count: number;
  status: PlatStatus;
  crush: boolean;
}

const activePlatSectors = new Set<number>();

// T_PlatRaise — runs every tic for an active platform
// Ported from p_plats.c lines 52-131
function makePlatThinker( plat: Plat, sectors: Sector[] ): () => boolean {

  let ticCount = 0;
  const sx = intToFixed( sectors[ plat.sectorIdx ].soundX );
  const sy = intToFixed( sectors[ plat.sectorIdx ].soundY );
  const sz = intToFixed( sectors[ plat.sectorIdx ].floorHeight );

  return () => {

    ticCount ++;

    const sector = sectors[ plat.sectorIdx ];

    markSectorDirty( plat.sectorIdx );

    switch ( plat.status ) {

      case 'up': {

        // raiseAndChange / raiseToNearestAndChange play sfx_stnmov every 8 tics
        if ( plat.type === 'raiseAndChange' || plat.type === 'raiseToNearestAndChange' ) {

          if ( ! ( ticCount & 7 ) ) playSoundAt( 'stnmov', sx, sy, sz );

        }

        const res = movePlane(
          sector, plat.speed, plat.high, plat.crush, 0, 1
        );

        if ( res === 'crushed' && ! plat.crush ) {

          plat.count = plat.wait;
          plat.status = 'down';
          playSoundAt( 'pstart', sx, sy, sz );

        } else if ( res === 'pastdest' ) {

          plat.count = plat.wait;
          plat.status = 'waiting';
          playSoundAt( 'pstop', sx, sy, sz );

          switch ( plat.type ) {

            case 'blazeDWUS':
            case 'downWaitUpStay':
            case 'raiseAndChange':
            case 'raiseToNearestAndChange':
              activePlatSectors.delete( plat.sectorIdx );
              return false; // done

            default:
              break;

          }

        }
        break;

      }

      case 'down': {

        const res = movePlane( sector, plat.speed, plat.low, false, 0, - 1 );

        if ( res === 'pastdest' ) {

          plat.count = plat.wait;
          plat.status = 'waiting';
          playSoundAt( 'pstop', sx, sy, sz );

        }
        break;

      }

      case 'waiting':
        if ( -- plat.count <= 0 ) {

          if ( sector.floorHeight <= plat.low ) {

            plat.status = 'up';

          } else {

            plat.status = 'down';

          }

          playSoundAt( 'pstart', sx, sy, sz );

        }
        break;

    }

    return true;

  };

}

// EV_DoPlat — activate tagged platforms
// Ported from p_plats.c lines 138-254
export function evDoPlat(
  type: PlatType,
  tag: number,
  amount: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): boolean {

  let activated = false;

  for ( let i = 0; i < sectors.length; i ++ ) {

    if ( sectors[ i ].tag !== tag ) continue;
    if ( activePlatSectors.has( i ) ) continue;

    activePlatSectors.add( i );
    activated = true;

    const sector = sectors[ i ];

    let speed = PLATSPEED;
    let low = sector.floorHeight;
    let high = sector.floorHeight;
    let status: PlatStatus = 'down';
    const wait = PLATWAIT * 35;

    switch ( type ) {

      case 'downWaitUpStay':
        speed = PLATSPEED * 4;
        low = getLowestFloorHeight( i, linedefs, sidedefs, sectors );
        if ( low > sector.floorHeight ) low = sector.floorHeight;
        high = sector.floorHeight;
        status = 'down';
        break;

      case 'blazeDWUS':
        speed = PLATSPEED * 8;
        low = getLowestFloorHeight( i, linedefs, sidedefs, sectors );
        if ( low > sector.floorHeight ) low = sector.floorHeight;
        high = sector.floorHeight;
        status = 'down';
        break;

      case 'perpetualRaise':
        speed = PLATSPEED;
        low = getLowestFloorHeight( i, linedefs, sidedefs, sectors );
        if ( low > sector.floorHeight ) low = sector.floorHeight;
        high = getHighestFloorHeight( i, linedefs, sidedefs, sectors );
        if ( high < sector.floorHeight ) high = sector.floorHeight;
        status = Math.random() < 0.5 ? 'up' : 'down';
        break;

      case 'raiseAndChange':
        speed = PLATSPEED / 2;
        high = sector.floorHeight + amount;
        status = 'up';
        break;

      case 'raiseToNearestAndChange':
        speed = PLATSPEED / 2;
        high = getHighestFloorHeight( i, linedefs, sidedefs, sectors );
        status = 'up';
        break;

    }

    // EV_DoPlat sounds (p_plats.c lines 194-249)
    const psx = intToFixed( sector.soundX );
    const psy = intToFixed( sector.soundY );
    const psz = intToFixed( sector.floorHeight );

    switch ( type ) {

      case 'raiseAndChange':
      case 'raiseToNearestAndChange':
        playSoundAt( 'stnmov', psx, psy, psz );
        break;

      case 'downWaitUpStay':
      case 'blazeDWUS':
      case 'perpetualRaise':
        playSoundAt( 'pstart', psx, psy, psz );
        break;

    }

    const plat: Plat = {
      sectorIdx: i,
      type,
      speed,
      low,
      high,
      wait,
      count: 0,
      status,
      crush: false
    };

    addThinker( makePlatThinker( plat, sectors ) );

  }

  return activated;

}
