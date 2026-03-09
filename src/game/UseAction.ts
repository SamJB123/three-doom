// Doom use action — player presses "use" to activate switches and doors.
// Also handles walk-over (cross) triggers.
// Ported from p_map.c (P_UseLines, PTR_UseTraverse) and p_spec.c / p_switch.c

import type { Linedef, Sidedef, Thing } from '../wad';
import { getLinedefsInBounds } from '../wad/BlockmapParser';
import type { DoomPlayer, DoomMapData } from '../physics/DoomMovement';
import { evVerticalDoor, evDoDoor } from './Doors';
import { evDoPlat } from './Platforms';
import { evDoFloor } from './Floors';
import { evDoCeiling, evCeilingCrushStop } from './Ceilings';
import { evBuildStairs } from './Stairs';
import { evTeleport } from './Teleport';
import { getSwitchPartner } from './Switches';
import { markSectorDirty } from './Thinkers';
import { playSound } from '../sound';
import { FRACBITS, fixedToFloat } from '../math/fixed';

// Exit callback — set from main.ts to trigger level end
let exitCallback: ( ( secret: boolean ) => void ) | null = null;

export function setExitCallback( cb: ( secret: boolean ) => void ): void {

  exitCallback = cb;

}

const USERANGE = 64; // 64 Doom units (integer, used in float-space trace)

// Track "use" key debounce
let useDown = false;

// P_UseLines — trace a line from the player and activate the first special line
export function useLines(
  player: DoomPlayer,
  angle: number, // Doom angle (radians)
  map: DoomMapData
): void {

  // Convert fixed-point player position to integer map units for ray trace
  const x1 = fixedToFloat( player.mo.x );
  const y1 = fixedToFloat( player.mo.y );
  const x2 = x1 + Math.cos( angle ) * USERANGE;
  const y2 = y1 + Math.sin( angle ) * USERANGE;

  // Find candidate linedefs via blockmap (integer coords)
  const minX = Math.floor( Math.min( x1, x2 ) ) - 1;
  const minY = Math.floor( Math.min( y1, y2 ) ) - 1;
  const maxX = Math.ceil( Math.max( x1, x2 ) ) + 1;
  const maxY = Math.ceil( Math.max( y1, y2 ) ) + 1;

  const candidates = getLinedefsInBounds( map.blockmap, minX, minY, maxX, maxY );

  // Sort by distance to player for "nearest first" traversal
  const sorted = [ ...candidates ].sort( ( a, b ) => {

    const la = map.linedefs[ a ];
    const lb = map.linedefs[ b ];
    const va = map.vertexes[ la.v1 ];
    const vb = map.vertexes[ lb.v1 ];
    const da = ( va.x - x1 ) * ( va.x - x1 ) + ( va.y - y1 ) * ( va.y - y1 );
    const db = ( vb.x - x1 ) * ( vb.x - x1 ) + ( vb.y - y1 ) * ( vb.y - y1 );
    return da - db;

  } );

  for ( const idx of sorted ) {

    const ld = map.linedefs[ idx ];
    const lv1 = map.vertexes[ ld.v1 ];
    const lv2 = map.vertexes[ ld.v2 ];

    // Ray-linedef intersection: compute t (along use ray) and u (along linedef)
    const hit = rayLinedefIntersect( x1, y1, x2, y2, lv1.x, lv1.y, lv2.x, lv2.y );
    if ( ! hit ) continue;
    if ( hit.t < 0 || hit.t > 1 ) continue; // beyond USERANGE
    if ( hit.u < 0 || hit.u > 1 ) continue; // off the linedef segment

    if ( ld.special !== 0 ) {

      // Activate this special line
      useSpecialLine( ld, map );
      return; // only one line per use

    }

    // Not special — check if it blocks (one-sided = wall)
    if ( ld.left < 0 ) {

      return; // hit a wall, stop

    }

    // Two-sided non-special: check if passable, if not stop
    const front = map.sectors[ map.sidedefs[ ld.right ].sector ];
    const back = map.sectors[ map.sidedefs[ ld.left ].sector ];
    const openRange = Math.min( front.ceilingHeight, back.ceilingHeight ) -
                      Math.max( front.floorHeight, back.floorHeight );

    if ( openRange <= 0 ) return; // blocked

    // Passable two-sided, keep checking

  }

}

// Handle "use" input with debounce (like original P_PlayerThink)
export function handleUseInput(
  pressed: boolean,
  player: DoomPlayer,
  angle: number,
  map: DoomMapData
): void {

  if ( pressed ) {

    if ( ! useDown ) {

      useLines( player, angle, map );
      useDown = true;

    }

  } else {

    useDown = false;

  }

}

// P_UseSpecialLine — dispatch line special actions (use-activated)
// Ported from p_switch.c lines 323-650
function useSpecialLine( line: Linedef, map: DoomMapData ): void {

  const { linedefs, sidedefs, sectors } = map;

  switch ( line.special ) {

    // === MANUAL DOORS (activated directly, no tag) ===
    case 1: case 26: case 27: case 28:
    case 31: case 32: case 33: case 34:
    case 117: case 118:
      evVerticalDoor( line, linedefs, sidedefs, sectors );
      break;

    // === SWITCHES (one-time use: special cleared) ===
    case 11: // Exit level (switch)
      changeSwitchTexture( line, sidedefs, false );
      if ( exitCallback ) exitCallback( false );
      break;

    case 51: // Secret exit (switch)
      changeSwitchTexture( line, sidedefs, false );
      if ( exitCallback ) exitCallback( true );
      break;

    case 7: // Build stairs (build8)
      if ( evBuildStairs( 'build8', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 127: // Build stairs turbo16
      if ( evBuildStairs( 'turbo16', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 41: // Lower ceiling to floor
      if ( evDoCeiling( 'lowerToFloor', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 49: // Ceiling crush and raise
      if ( evDoCeiling( 'crushAndRaise', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 29: // Raise door
      if ( evDoDoor( 'normal', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 50: // Close door
      if ( evDoDoor( 'close', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 103: // Open door
      if ( evDoDoor( 'open', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 111: // Blazing door raise
      if ( evDoDoor( 'blazeRaise', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 112: // Blazing door open
      if ( evDoDoor( 'blazeOpen', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 113: // Blazing door close
      if ( evDoDoor( 'blazeClose', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    // Platforms
    case 14: // Raise floor 32 and change
      if ( evDoPlat( 'raiseAndChange', line.tag, 32, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 15: // Raise floor 24 and change
      if ( evDoPlat( 'raiseAndChange', line.tag, 24, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 20: // Raise plat to nearest and change
      if ( evDoPlat( 'raiseToNearestAndChange', line.tag, 0, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 21: // PlatDownWaitUpStay
      if ( evDoPlat( 'downWaitUpStay', line.tag, 0, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 122: // Blazing PlatDWUS
      if ( evDoPlat( 'blazeDWUS', line.tag, 0, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    // Floors
    case 18: // Raise floor to next highest
      if ( evDoFloor( 'raiseFloorToNearest', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 23: // Lower floor to lowest
      if ( evDoFloor( 'lowerFloorToLowest', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 71: // Turbo lower floor
      if ( evDoFloor( 'turboLower', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 101: // Raise floor
      if ( evDoFloor( 'raiseFloor', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    case 102: // Lower floor
      if ( evDoFloor( 'lowerFloor', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, false );
      break;

    // === BUTTONS (reusable: switch reverts after BUTTONTIME) ===
    case 42: // Close door (button)
      if ( evDoDoor( 'close', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 61: // Open door (button)
      if ( evDoDoor( 'open', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 62: // PlatDWUS (button)
      if ( evDoPlat( 'downWaitUpStay', line.tag, 0, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 63: // Raise door (button)
      if ( evDoDoor( 'normal', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 45: // Lower floor (button)
      if ( evDoFloor( 'lowerFloor', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 60: // Lower floor to lowest (button)
      if ( evDoFloor( 'lowerFloorToLowest', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 64: // Raise floor (button)
      if ( evDoFloor( 'raiseFloor', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 65: // Raise floor crush (button)
      if ( evDoFloor( 'raiseFloorCrush', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 69: // Raise floor to nearest (button)
      if ( evDoFloor( 'raiseFloorToNearest', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 70: // Turbo lower floor (button)
      if ( evDoFloor( 'turboLower', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 114: // Blazing door raise (button)
      if ( evDoDoor( 'blazeRaise', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 115: // Blazing door open (button)
      if ( evDoDoor( 'blazeOpen', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 116: // Blazing door close (button)
      if ( evDoDoor( 'blazeClose', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 123: // Blazing PlatDWUS (button)
      if ( evDoPlat( 'blazeDWUS', line.tag, 0, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

    case 43: // Lower ceiling to floor (button)
      if ( evDoCeiling( 'lowerToFloor', line.tag, linedefs, sidedefs, sectors ) )
        changeSwitchTexture( line, sidedefs, true );
      break;

  }

}

// P_CrossSpecialLine — triggered when player walks over a linedef
// Ported from p_spec.c
export function crossSpecialLine(
  line: Linedef,
  map: DoomMapData,
  player?: DoomPlayer,
  things?: Thing[]
): void {

  if ( line.special === 0 ) return;

  const { linedefs, sidedefs, sectors } = map;
  let clearSpecial = true; // most walk-overs are one-time triggers

  switch ( line.special ) {

    // Walk-over triggers (one-time)
    case 2: evDoDoor( 'open', line.tag, linedefs, sidedefs, sectors ); break;
    case 3: evDoDoor( 'close', line.tag, linedefs, sidedefs, sectors ); break;
    case 4: evDoDoor( 'normal', line.tag, linedefs, sidedefs, sectors ); break;
    case 10: evDoPlat( 'downWaitUpStay', line.tag, 0, linedefs, sidedefs, sectors ); break;
    case 16: evDoDoor( 'close30ThenOpen', line.tag, linedefs, sidedefs, sectors ); break;
    case 19: evDoFloor( 'lowerFloor', line.tag, linedefs, sidedefs, sectors ); break;
    case 22: evDoPlat( 'raiseToNearestAndChange', line.tag, 0, linedefs, sidedefs, sectors ); break;
    case 6: evDoCeiling( 'fastCrushAndRaise', line.tag, linedefs, sidedefs, sectors ); break;
    case 8: evBuildStairs( 'build8', line.tag, linedefs, sidedefs, sectors ); break;
    case 25: evDoCeiling( 'crushAndRaise', line.tag, linedefs, sidedefs, sectors ); break;
    case 39: if ( player && things ) evTeleport( line, 0, player, map, things ); break;
    case 44: evDoCeiling( 'lowerAndCrush', line.tag, linedefs, sidedefs, sectors ); break;
    case 57: evCeilingCrushStop( line.tag ); break;
    case 100: evBuildStairs( 'turbo16', line.tag, linedefs, sidedefs, sectors ); break;
    case 30: evDoFloor( 'raiseFloor', line.tag, linedefs, sidedefs, sectors ); break;
    case 36: evDoFloor( 'turboLower', line.tag, linedefs, sidedefs, sectors ); break;
    case 37: evDoFloor( 'lowerAndChange', line.tag, linedefs, sidedefs, sectors ); break;
    case 38: evDoFloor( 'lowerFloorToLowest', line.tag, linedefs, sidedefs, sectors ); break;
    case 5: evDoFloor( 'raiseFloor', line.tag, linedefs, sidedefs, sectors ); break;
    case 53: evDoPlat( 'perpetualRaise', line.tag, 0, linedefs, sidedefs, sectors ); break;
    case 56: evDoFloor( 'raiseFloorCrush', line.tag, linedefs, sidedefs, sectors ); break;
    case 58: evDoFloor( 'raiseFloor24', line.tag, linedefs, sidedefs, sectors ); break;
    case 59: evDoFloor( 'raiseFloor24AndChange', line.tag, linedefs, sidedefs, sectors ); break;
    case 108: evDoDoor( 'blazeRaise', line.tag, linedefs, sidedefs, sectors ); break;
    case 109: evDoDoor( 'blazeOpen', line.tag, linedefs, sidedefs, sectors ); break;
    case 110: evDoDoor( 'blazeClose', line.tag, linedefs, sidedefs, sectors ); break;
    case 119: evDoFloor( 'raiseFloorToNearest', line.tag, linedefs, sidedefs, sectors ); break;
    case 121: evDoPlat( 'blazeDWUS', line.tag, 0, linedefs, sidedefs, sectors ); break;
    case 130: evDoFloor( 'raiseFloorTurbo', line.tag, linedefs, sidedefs, sectors ); break;

    // Exit (walk-over)
    case 52: if ( exitCallback ) exitCallback( false ); break;
    case 124: if ( exitCallback ) exitCallback( true ); break;

    // Retriggers (keep special)
    case 72: evDoCeiling( 'lowerAndCrush', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 73: evDoCeiling( 'crushAndRaise', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 74: evCeilingCrushStop( line.tag ); clearSpecial = false; break;
    case 77: evDoCeiling( 'fastCrushAndRaise', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 97: if ( player && things ) evTeleport( line, 0, player, map, things ); clearSpecial = false; break;
    case 141: evDoCeiling( 'silentCrushAndRaise', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 75: evDoDoor( 'close', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 76: evDoDoor( 'close30ThenOpen', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 86: evDoDoor( 'open', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 88: evDoPlat( 'downWaitUpStay', line.tag, 0, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 90: evDoDoor( 'normal', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 91: evDoFloor( 'raiseFloor', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 82: evDoFloor( 'lowerFloorToLowest', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 83: evDoFloor( 'lowerFloor', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 87: evDoPlat( 'perpetualRaise', line.tag, 0, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 98: evDoFloor( 'turboLower', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 105: evDoDoor( 'blazeRaise', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 106: evDoDoor( 'blazeOpen', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 107: evDoDoor( 'blazeClose', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 120: evDoPlat( 'blazeDWUS', line.tag, 0, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 128: evDoFloor( 'raiseFloorToNearest', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;
    case 129: evDoFloor( 'raiseFloorTurbo', line.tag, linedefs, sidedefs, sectors ); clearSpecial = false; break;

    default:
      clearSpecial = false;
      break;

  }

  if ( clearSpecial ) line.special = 0;

}

// Change switch texture on activation
const BUTTONTIME = 35; // 1 second in tics

interface ActiveButton {
  side: Sidedef;
  position: 'upper' | 'middle' | 'lower';
  originalTex: string;
  timer: number;
}

const activeButtons: ActiveButton[] = [];

function changeSwitchTexture(
  line: Linedef,
  sidedefs: Sidedef[],
  useAgain: boolean
): void {

  if ( line.right < 0 ) return;

  const side = sidedefs[ line.right ];

  // Check upper, middle, lower textures for switch matches
  const texKeys: ( 'upper' | 'middle' | 'lower' )[] = [ 'upper', 'middle', 'lower' ];

  for ( let i = 0; i < 3; i ++ ) {

    const key = texKeys[ i ];
    const tex = side[ key ];
    const partner = getSwitchPartner( tex );

    if ( partner ) {

      // Check if button already active for this side+position (don't double-activate)
      if ( useAgain ) {

        const alreadyActive = activeButtons.some( b => b.side === side && b.position === key );
        if ( alreadyActive ) return;

      }

      side[ key ] = partner;

      if ( useAgain ) {

        activeButtons.push( {
          side,
          position: key,
          originalTex: tex,
          timer: BUTTONTIME
        } );

      } else {

        line.special = 0;

      }

      // Play switch sound (p_switch.c: sfx_swtchn for one-time, sfx_swtchx for button)
      playSound( useAgain ? 'swtchx' : 'swtchn' );

      // Mark dirty for visual update
      markSectorDirty( side.sector );
      return;

    }

  }

}

// Run button timers (call every tic) — revert texture when timer expires
export function updateButtons( _sidedefs: Sidedef[] ): void {

  for ( let i = activeButtons.length - 1; i >= 0; i -- ) {

    if ( -- activeButtons[ i ].timer <= 0 ) {

      const btn = activeButtons[ i ];

      // Restore original texture
      btn.side[ btn.position ] = btn.originalTex;

      // Mark dirty for visual update
      markSectorDirty( btn.side.sector );

      // Play revert sound
      playSound( 'swtchn' );

      activeButtons.splice( i, 1 );

    }

  }

}

// ============================================================
// Ray-linedef intersection
// Returns t (fraction along ray) and u (fraction along linedef),
// or null if the lines are parallel.
// ============================================================

function rayLinedefIntersect(
  rx1: number, ry1: number, rx2: number, ry2: number,
  lx1: number, ly1: number, lx2: number, ly2: number
): { t: number; u: number } | null {

  const rdx = rx2 - rx1;
  const rdy = ry2 - ry1;
  const ldx = lx2 - lx1;
  const ldy = ly2 - ly1;

  const denom = rdx * ldy - rdy * ldx;
  if ( Math.abs( denom ) < 0.001 ) return null; // parallel

  const t = ( ( lx1 - rx1 ) * ldy - ( ly1 - ry1 ) * ldx ) / denom;
  const u = ( ( lx1 - rx1 ) * rdy - ( ly1 - ry1 ) * rdx ) / denom;

  return { t, u };

}
