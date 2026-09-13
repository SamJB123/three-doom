// Doom ceiling movement system — crushers and ceiling movers.
// Ported from p_ceilng.c

import type { Sector, Linedef, Sidedef } from '../wad';
import { movePlane, getHighestCeilingHeight } from './SectorHelpers';
import { addThinker, markSectorDirty, archivedThinker, busySectors } from './Thinkers';
import { playSoundAt } from '../sound';
import { intToFixed } from '../math/fixed';

export type CeilingType =
  | 'lowerToFloor'
  | 'raiseToHighest'
  | 'lowerAndCrush'
  | 'crushAndRaise'
  | 'fastCrushAndRaise'
  | 'silentCrushAndRaise';

export interface CeilingMove {
  sectorIdx: number;
  type: CeilingType;
  bottomHeight: number;
  topHeight: number;
  speed: number;
  crush: boolean;
  direction: number;
  tag: number;
  oldDirection: number;
  thinker: ( () => boolean ) | null;
}

const MAXCEILINGS = 30;
const activeCeilings: ( CeilingMove | null )[] = new Array( MAXCEILINGS ).fill( null );

export function resetCeilings(): void { activeCeilings.fill(null); }

const CEILSPEED = 1; // FRACUNIT equivalent in map units

function addActiveCeiling( ceiling: CeilingMove ): void {
  busySectors.add(ceiling.sectorIdx);

  for ( let i = 0; i < MAXCEILINGS; i ++ ) {

    if ( activeCeilings[ i ] === null ) {

      activeCeilings[ i ] = ceiling;
      return;

    }

  }

}

function removeActiveCeiling( ceiling: CeilingMove ): void {
  busySectors.delete(ceiling.sectorIdx);

  for ( let i = 0; i < MAXCEILINGS; i ++ ) {

    if ( activeCeilings[ i ] === ceiling ) {

      activeCeilings[ i ] = null;
      return;

    }

  }

}

function makeCeilingThinker( cm: CeilingMove, sectors: Sector[] ): () => boolean {

  const sx = intToFixed( sectors[ cm.sectorIdx ].soundX );
  const sy = intToFixed( sectors[ cm.sectorIdx ].soundY );
  const sz = intToFixed( sectors[ cm.sectorIdx ].ceilingHeight );

  return archivedThinker(() => {

    const sector = sectors[ cm.sectorIdx ];
    markSectorDirty( cm.sectorIdx );

    switch ( cm.direction ) {

      case 0:
        // In stasis — keep alive but don't move
        return true;

      case 1: {

        // Moving up
        const res = movePlane( sector, cm.speed, cm.topHeight, false, 1, 1 );

        if ( Math.floor( sector.ceilingHeight ) % 8 === 0 &&
             cm.type !== 'silentCrushAndRaise' ) {

          playSoundAt( 'stnmov', sx, sy, sz );

        }

        if ( res === 'pastdest' ) {

          switch ( cm.type ) {

            case 'raiseToHighest':
              removeActiveCeiling( cm );
              return false;

            case 'silentCrushAndRaise':
              playSoundAt( 'pstop', sx, sy, sz );
              // fall through
            case 'fastCrushAndRaise':
            case 'crushAndRaise':
              cm.direction = - 1;
              return true;

            default:
              return true;

          }

        }

        return true;

      }

      case - 1: {

        // Moving down
        const res = movePlane( sector, cm.speed, cm.bottomHeight, cm.crush, 1, - 1 );

        if ( Math.floor( sector.ceilingHeight ) % 8 === 0 &&
             cm.type !== 'silentCrushAndRaise' ) {

          playSoundAt( 'stnmov', sx, sy, sz );

        }

        if ( res === 'pastdest' ) {

          switch ( cm.type ) {

            case 'silentCrushAndRaise':
              playSoundAt( 'pstop', sx, sy, sz );
              // fall through
            case 'crushAndRaise':
              cm.speed = CEILSPEED;
              // fall through
            case 'fastCrushAndRaise':
              cm.direction = 1;
              return true;

            case 'lowerAndCrush':
            case 'lowerToFloor':
              removeActiveCeiling( cm );
              return false;

            default:
              return true;

          }

        } else if ( res === 'crushed' ) {

          switch ( cm.type ) {

            case 'silentCrushAndRaise':
            case 'crushAndRaise':
            case 'lowerAndCrush':
              cm.speed = CEILSPEED / 8;
              return true;

            default:
              return true;

          }

        }

        return true;

      }

    }

    return true;

  }, 'ceiling', () => ({...cm, thinker: null}));

}

// Reactivate crushers that were stopped (in stasis)
function activateInStasisCeiling( tag: number, sectors: Sector[] ): void {

  for ( let i = 0; i < MAXCEILINGS; i ++ ) {

    const cm = activeCeilings[ i ];
    if ( cm && cm.tag === tag && cm.direction === 0 ) {

      cm.direction = cm.oldDirection;
      // The stasis thinker stays registered; resume it without duplicating it.

    }

  }

}

// EV_DoCeiling — activate ceiling movers on tagged sectors
export function evDoCeiling(
  type: CeilingType,
  tag: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): boolean {

  // For crusher types, try to reactivate stasis'd ceilings first
  if ( type === 'fastCrushAndRaise' || type === 'silentCrushAndRaise' ||
       type === 'crushAndRaise' ) {

    activateInStasisCeiling( tag, sectors );

  }

  let activated = false;

  for ( let i = 0; i < sectors.length; i ++ ) {

    if ( sectors[ i ].tag !== tag ) continue;

    // Check if already active
    let alreadyActive = false;
    for ( let j = 0; j < MAXCEILINGS; j ++ ) {

      if ( activeCeilings[ j ] && activeCeilings[ j ]!.sectorIdx === i ) {

        alreadyActive = true;
        break;

      }

    }
    if ( alreadyActive || busySectors.has(i) ) continue;

    activated = true;
    const sector = sectors[ i ];

    const cm: CeilingMove = {
      sectorIdx: i,
      type,
      bottomHeight: sector.floorHeight,
      topHeight: sector.ceilingHeight,
      speed: CEILSPEED,
      crush: false,
      direction: - 1,
      tag,
      oldDirection: 0,
      thinker: null
    };

    switch ( type ) {

      case 'fastCrushAndRaise':
        cm.crush = true;
        cm.topHeight = sector.ceilingHeight;
        cm.bottomHeight = sector.floorHeight + 8;
        cm.direction = - 1;
        cm.speed = CEILSPEED * 2;
        break;

      case 'silentCrushAndRaise':
      case 'crushAndRaise':
        cm.crush = true;
        cm.topHeight = sector.ceilingHeight;
        cm.bottomHeight = sector.floorHeight + 8;
        cm.direction = - 1;
        cm.speed = CEILSPEED;
        break;

      case 'lowerAndCrush':
        cm.bottomHeight = sector.floorHeight + 8;
        cm.direction = - 1;
        cm.speed = CEILSPEED;
        break;

      case 'lowerToFloor':
        cm.bottomHeight = sector.floorHeight;
        cm.direction = - 1;
        cm.speed = CEILSPEED;
        break;

      case 'raiseToHighest':
        cm.topHeight = getHighestCeilingHeight( i, linedefs, sidedefs, sectors );
        cm.direction = 1;
        cm.speed = CEILSPEED;
        break;

    }

    cm.thinker = makeCeilingThinker( cm, sectors );
    addThinker( cm.thinker );
    addActiveCeiling( cm );

  }

  return activated;

}

// EV_CeilingCrushStop — stop active crushers with matching tag
export function evCeilingCrushStop(
  tag: number
): boolean {

  let stopped = false;

  for ( let i = 0; i < MAXCEILINGS; i ++ ) {

    const cm = activeCeilings[ i ];
    if ( cm && cm.tag === tag && cm.direction !== 0 ) {

      cm.oldDirection = cm.direction;
      cm.direction = 0;
      stopped = true;

    }

  }

  return stopped;

}

export function restoreCeilings(state: CeilingMove, sectors: Sector[]): void {
  addActiveCeiling(state);
  addThinker(makeCeilingThinker(state, sectors));
}
