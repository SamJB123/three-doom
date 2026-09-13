import {sectorTic} from './SectorHelpers';
// Doom platform/lift system — sectors whose floors move up and down.
// Ported from p_plats.c

import type { Linedef, Sidedef, Sector } from '../wad';
import { movePlane, getLowestFloorHeight, getHighestFloorHeight, getNextHighestFloor } from './SectorHelpers';
import { addThinker, markSectorDirty, archivedThinker, busySectors } from './Thinkers';
import { playSoundAt } from '../sound';
import { P_Random } from './DoomRandom';
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

type PlatStatus = 'up' | 'down' | 'waiting' | 'stasis';

export interface Plat {
  sectorIdx: number;
  type: PlatType;
  speed: number;
  low: number;
  high: number;
  wait: number;
  count: number;
  status: PlatStatus;
  crush: boolean;
  ticCount?: number;
  tag?: number;
  oldStatus?: PlatStatus;
}

const activePlatSectors = new Map<number,Plat>();
export function resetPlatforms(): void { activePlatSectors.clear(); }

// T_PlatRaise — runs every tic for an active platform
// Ported from p_plats.c lines 52-131
function makePlatThinker( plat: Plat, sectors: Sector[] ): () => boolean {


  const sx = intToFixed( sectors[ plat.sectorIdx ].soundX );
  const sy = intToFixed( sectors[ plat.sectorIdx ].soundY );
  const sz = intToFixed( sectors[ plat.sectorIdx ].floorHeight );

  return archivedThinker(() => {


    const sector = sectors[ plat.sectorIdx ];

    markSectorDirty( plat.sectorIdx );

    switch ( plat.status ) {

      case 'up': {

        // raiseAndChange / raiseToNearestAndChange play sfx_stnmov every 8 tics
        if ( plat.type === 'raiseAndChange' || plat.type === 'raiseToNearestAndChange' ) {

          if ( ! ( sectorTic() & 7 ) ) playSoundAt( 'stnmov', sx, sy, sz, sector);

        }

        const res = movePlane(
          sector, plat.speed, plat.high, plat.crush, 0, 1
        );

        if ( res === 'crushed' && ! plat.crush ) {

          plat.count = plat.wait;
          plat.status = 'down';
          playSoundAt( 'pstart', sx, sy, sz, sector);

        } else if ( res === 'pastdest' ) {

          plat.count = plat.wait;
          plat.status = 'waiting';
          playSoundAt( 'pstop', sx, sy, sz, sector);

          switch ( plat.type ) {

            case 'blazeDWUS':
            case 'downWaitUpStay':
            case 'raiseAndChange':
            case 'raiseToNearestAndChange':
              activePlatSectors.delete( plat.sectorIdx ); busySectors.delete(plat.sectorIdx);
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
          playSoundAt( 'pstop', sx, sy, sz, sector);

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

          playSoundAt( 'pstart', sx, sy, sz, sector);

        }
        break;

    }

    return true;

  }, 'platform', () => plat);

}

// EV_DoPlat — activate tagged platforms
// Ported from p_plats.c lines 138-254
export function evDoPlat(
  type: PlatType,
  tag: number,
  amount: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[],
  trigger?: Linedef
): boolean {

  let activated = false;
  if(type==='perpetualRaise')for(const plat of activePlatSectors.values()) {
    if(plat.tag===tag && plat.status==='stasis') {plat.status=plat.oldStatus ?? 'up';activated=true;}
  }

  for ( let i = 0; i < sectors.length; i ++ ) {

    if ( sectors[ i ].tag !== tag ) continue;
    if ( busySectors.has( i ) ) continue;


    activated = true;

    const sector = sectors[ i ];

    let speed = PLATSPEED;
    let low = sector.floorHeight;
    let high = sector.floorHeight;
    let status: PlatStatus = 'down';
    let wait = PLATWAIT * 35;

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
        status = (P_Random() & 1) === 0 ? 'up' : 'down';
        break;

      case 'raiseAndChange':
        speed = PLATSPEED / 2;
        high = sector.floorHeight + amount;
        wait=0;
        if(trigger)sector.floorTex=sectors[sidedefs[trigger.right].sector].floorTex;
        status = 'up';
        break;

      case 'raiseToNearestAndChange':
        speed = PLATSPEED / 2;
        high = getNextHighestFloor( i, linedefs, sidedefs, sectors );
        wait=0;sector.special=0;
        if(trigger)sector.floorTex=sectors[sidedefs[trigger.right].sector].floorTex;
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
        playSoundAt( 'stnmov', psx, psy, psz, sector);
        break;

      case 'downWaitUpStay':
      case 'blazeDWUS':
      case 'perpetualRaise':
        playSoundAt( 'pstart', psx, psy, psz, sector);
        break;

    }

    const plat: Plat = {
      sectorIdx: i,tag,
      type,
      speed,
      low,
      high,
      wait,
      count: 0,
      status,
      crush: false
    };

    activePlatSectors.set(i,plat);busySectors.add(i);
    addThinker( makePlatThinker( plat, sectors ) );

  }

  return activated;

}

export function restorePlatforms(state: Plat, sectors: Sector[]): void {
  activePlatSectors.set(state.sectorIdx,state);busySectors.add(state.sectorIdx);
  addThinker(makePlatThinker(state, sectors));
}

export function evStopPlat(tag: number): void {
  for(const plat of activePlatSectors.values())if(plat.tag===tag && plat.status!=='stasis'){
    plat.oldStatus=plat.status;plat.status='stasis';
  }
}
