// Doom cheat code system — ported from st_stuff.c.
// Buffers keypress characters and matches against known cheat strings.

import type { PlayerStatusState } from '../ecs/traits';
import { AMMO_TYPES, WEAPON_SLOTS, CARD_TYPES, POWER_DURATIONS } from '../ecs/traits';
import type { PowerType } from '../ecs/traits';
import { playSound } from '../sound';

const MAX_CHEAT_BUFFER = 20;

let cheatBuffer = '';

/**
 * Feed a single character into the cheat buffer and check for matches.
 * Call this from a keypress listener. Returns true if a cheat activated.
 */
export function feedCheatChar( char: string, state: PlayerStatusState ): boolean {

  // Only accept lowercase letters and digits
  const c = char.toLowerCase();
  if ( ! /^[a-z0-9]$/.test( c ) ) return false;

  cheatBuffer = ( cheatBuffer + c ).slice( - MAX_CHEAT_BUFFER );

  // IDDQD — God mode toggle
  if ( match( 'iddqd' ) ) {

    state.godMode = ! state.godMode;

    if ( state.godMode ) {

      state.health = 100;

    }

    playSound( 'getpow' );
    return true;

  }

  // IDKFA — Full arsenal + keys
  if ( match( 'idkfa' ) ) {

    grantFullArsenal( state, true );
    playSound( 'getpow' );
    return true;

  }

  // IDFA — Full arsenal, no keys
  if ( match( 'idfa' ) ) {

    grantFullArsenal( state, false );
    playSound( 'getpow' );
    return true;

  }

  // IDSPISPOPD / IDCLIP — No-clip toggle
  if ( match( 'idspispopd' ) || match( 'idclip' ) ) {

    state.noClip = ! state.noClip;
    playSound( 'getpow' );
    return true;

  }

  // IDBEHOLD + letter — Toggle powerup
  const powerCheats: [ string, PowerType ][] = [
    [ 'idbeholdv', 'invulnerability' ],
    [ 'idbeholds', 'strength' ],
    [ 'idbeholdi', 'invisibility' ],
    [ 'idbeholdr', 'ironfeet' ],
    [ 'idbeholda', 'allmap' ],
    [ 'idbeholdl', 'infrared' ],
  ];

  for ( const [ pattern, power ] of powerCheats ) {

    if ( match( pattern ) ) {

      if ( state.powers[ power ] > 0 ) {

        state.powers[ power ] = 0;

      } else {

        state.powers[ power ] = POWER_DURATIONS[ power ];

      }

      playSound( 'getpow' );
      return true;

    }

  }

  // IDCHOPPERS — Chainsaw + invulnerability
  if ( match( 'idchoppers' ) ) {

    state.weapons.chainsaw = true;
    state.powers.invulnerability = 1;
    playSound( 'getpow' );
    return true;

  }

  return false;

}

function match( pattern: string ): boolean {

  return cheatBuffer.endsWith( pattern );

}

function grantFullArsenal( state: PlayerStatusState, withKeys: boolean ): void {

  state.armor = 200;
  state.armorType = 2;

  for ( const ws of WEAPON_SLOTS ) {

    state.weapons[ ws ] = true;

  }

  for ( const at of AMMO_TYPES ) {

    state.ammo[ at ] = state.maxAmmo[ at ];

  }

  if ( withKeys ) {

    for ( const card of CARD_TYPES ) {

      state.cards[ card ] = true;

    }

  }

}
