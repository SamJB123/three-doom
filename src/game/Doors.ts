// Doom door system — vertical doors that raise/lower sector ceilings.
// Ported from p_doors.c

import type { Linedef, Sidedef, Sector } from '../wad';
import { movePlane, getLowestCeilingHeight } from './SectorHelpers';
import { addThinker, markSectorDirty } from './Thinkers';
import { playSoundAt } from '../sound';
import { intToFixed } from '../math/fixed';

// p_spec.h constants (converted from fixed-point)
const VDOORSPEED = 2; // FRACUNIT * 2 → 2 units/tic
const VDOORWAIT = 150; // 150 tics at top (~4.3 seconds)

export type VDoorType =
  | 'normal'         // opens, waits, closes
  | 'close'          // just closes
  | 'open'           // just opens (stays open)
  | 'blazeRaise'     // fast open, wait, close
  | 'blazeOpen'      // fast open (stays open)
  | 'blazeClose'     // fast close
  | 'close30ThenOpen'; // closes, waits 30s, opens

interface VDoor {
  sectorIdx: number;
  type: VDoorType;
  topHeight: number;
  speed: number;
  direction: number; // 1=up, 0=waiting, -1=down
  topWait: number;
  topCountdown: number;
}

// Track which sectors already have active door thinkers
const activeDoorSectors = new Set<number>();

// T_VerticalDoor — runs every tic for an active door
// Ported from p_doors.c lines 63-198
function makeVerticalDoorThinker(
  door: VDoor,
  sectors: Sector[]
): () => boolean {

  const sx = intToFixed( sectors[ door.sectorIdx ].soundX );
  const sy = intToFixed( sectors[ door.sectorIdx ].soundY );
  const sz = intToFixed( sectors[ door.sectorIdx ].floorHeight );

  return () => {

    const sector = sectors[ door.sectorIdx ];

    markSectorDirty( door.sectorIdx );

    switch ( door.direction ) {

      case 0: // WAITING at top
        if ( -- door.topCountdown <= 0 ) {

          switch ( door.type ) {

            case 'blazeRaise':
              door.direction = - 1; // start closing
              playSoundAt( 'bdcls', sx, sy, sz );
              break;

            case 'normal':
              door.direction = - 1; // start closing
              playSoundAt( 'dorcls', sx, sy, sz );
              break;

            case 'close30ThenOpen':
              door.direction = 1; // reopen
              playSoundAt( 'doropn', sx, sy, sz );
              break;

            default:
              break;

          }

        }
        break;

      case 1: { // GOING UP

        const res = movePlane( sector, door.speed, door.topHeight, false, 1, 1 );

        if ( res === 'pastdest' ) {

          switch ( door.type ) {

            case 'blazeRaise':
            case 'normal':
              door.direction = 0; // wait at top
              door.topCountdown = door.topWait;
              break;

            case 'close30ThenOpen':
            case 'blazeOpen':
            case 'open':
              // Door stays open — remove thinker
              activeDoorSectors.delete( door.sectorIdx );
              return false;

            default:
              break;

          }

        }
        break;

      }

      case - 1: { // GOING DOWN

        const res = movePlane(
          sector, door.speed, sector.floorHeight, false, 1, - 1
        );

        if ( res === 'pastdest' ) {

          switch ( door.type ) {

            case 'blazeRaise':
            case 'blazeClose':
              playSoundAt( 'bdcls', sx, sy, sz );
              activeDoorSectors.delete( door.sectorIdx );
              return false; // done

            case 'normal':
            case 'close':
              activeDoorSectors.delete( door.sectorIdx );
              return false; // done

            case 'close30ThenOpen':
              door.direction = 0;
              door.topCountdown = 35 * 30; // 30 seconds
              break;

            default:
              break;

          }

        } else if ( res === 'crushed' ) {

          // Door hit something — reverse unless it's a close-only type
          if ( door.type !== 'close' && door.type !== 'blazeClose' ) {

            door.direction = 1;
            playSoundAt( 'doropn', sx, sy, sz );

          }

        }
        break;

      }

    }

    return true; // keep alive

  };

}

// EV_VerticalDoor — activate a manual door (player presses use on linedef)
// Ported from p_doors.c lines 376-530
export function evVerticalDoor(
  line: Linedef,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): void {

  // The door sector is on the BACK side of the linedef
  if ( line.left < 0 ) return;

  const doorSectorIdx = sidedefs[ line.left ].sector;
  const sector = sectors[ doorSectorIdx ];

  // If door is already active, reverse it
  if ( activeDoorSectors.has( doorSectorIdx ) ) {

    // We don't have direct reference to the door thinker, so just skip
    // (In original Doom, this reverses the door direction)
    return;

  }

  activeDoorSectors.add( doorSectorIdx );

  // Determine door type and speed from line special
  let type: VDoorType = 'normal';
  let speed = VDOORSPEED;

  switch ( line.special ) {

    case 1: case 26: case 27: case 28:
      type = 'normal';
      break;

    case 31: case 32: case 33: case 34:
      type = 'open';
      line.special = 0; // one-time use
      break;

    case 117:
      type = 'blazeRaise';
      speed = VDOORSPEED * 4;
      break;

    case 118:
      type = 'blazeOpen';
      speed = VDOORSPEED * 4;
      line.special = 0;
      break;

    default:
      type = 'normal';
      break;

  }

  // Target height: lowest ceiling of neighboring sectors minus 4
  const topHeight = getLowestCeilingHeight(
    doorSectorIdx, linedefs, sidedefs, sectors
  ) - 4;

  const door: VDoor = {
    sectorIdx: doorSectorIdx,
    type,
    topHeight,
    speed,
    direction: 1, // start opening
    topWait: VDOORWAIT,
    topCountdown: 0
  };

  // Play door open sound (p_doors.c lines 440-455)
  const dsx = intToFixed( sector.soundX );
  const dsy = intToFixed( sector.soundY );
  const dsz = intToFixed( sector.floorHeight );

  if ( line.special === 117 || line.special === 118 ) {

    playSoundAt( 'bdopn', dsx, dsy, dsz );

  } else {

    playSoundAt( 'doropn', dsx, dsy, dsz );

  }

  addThinker( makeVerticalDoorThinker( door, sectors ) );

}

// EV_DoDoor — activate tagged doors (switches, walk-overs)
// Ported from p_doors.c lines 264-347
export function evDoDoor(
  type: VDoorType,
  tag: number,
  linedefs: Linedef[],
  sidedefs: Sidedef[],
  sectors: Sector[]
): boolean {

  let activated = false;

  for ( let i = 0; i < sectors.length; i ++ ) {

    if ( sectors[ i ].tag !== tag ) continue;
    if ( activeDoorSectors.has( i ) ) continue;

    activeDoorSectors.add( i );
    activated = true;

    let speed = VDOORSPEED;
    let direction = 1;

    if ( type === 'blazeRaise' || type === 'blazeOpen' || type === 'blazeClose' ) {

      speed = VDOORSPEED * 4;

    }

    if ( type === 'close' || type === 'blazeClose' ) {

      direction = - 1;

    }

    const topHeight = ( type === 'close' || type === 'blazeClose' || type === 'close30ThenOpen' )
      ? sectors[ i ].ceilingHeight
      : getLowestCeilingHeight( i, linedefs, sidedefs, sectors ) - 4;

    const door: VDoor = {
      sectorIdx: i,
      type,
      topHeight,
      speed,
      direction,
      topWait: VDOORWAIT,
      topCountdown: type === 'close30ThenOpen' ? 35 * 30 : 0
    };

    // EV_DoDoor sounds (p_doors.c lines 296-343)
    const esx = intToFixed( sectors[ i ].soundX );
    const esy = intToFixed( sectors[ i ].soundY );
    const esz = intToFixed( sectors[ i ].floorHeight );

    switch ( type ) {

      case 'blazeClose':
        playSoundAt( 'bdcls', esx, esy, esz );
        break;

      case 'close':
      case 'close30ThenOpen':
        playSoundAt( 'dorcls', esx, esy, esz );
        break;

      case 'blazeRaise':
      case 'blazeOpen':
        if ( topHeight !== sectors[ i ].ceilingHeight )
          playSoundAt( 'bdopn', esx, esy, esz );
        break;

      case 'normal':
      case 'open':
        if ( topHeight !== sectors[ i ].ceilingHeight )
          playSoundAt( 'doropn', esx, esy, esz );
        break;

    }

    addThinker( makeVerticalDoorThinker( door, sectors ) );

  }

  return activated;

}
