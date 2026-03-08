// Player mobj state machine — ported from info.c and p_user.c.
// Drives pain sounds, death sequences, and state transitions.
// States mirror the original S_PLAY_* states from info.c.

import type { PlayerStatusState, PlayerMobjState } from '../ecs/traits';
import { playSound } from '../sound';
import { P_Random } from './DoomRandom';

// ============================================================
// Player mobj states — from info.c
// Frame numbers are irrelevant in first-person but kept for accuracy.
// Actions are what matter: A_Pain plays painsound, A_PlayerScream
// plays death sound, A_Fall removes MF_SOLID, etc.
// ============================================================

interface PlayerStateEntry {
  tics: number;
  action: string | null;
  next: string;
}

const PLAYER_STATES: Record<string, PlayerStateEntry> = {

  // --- Idle / running (infinite tic = stay here) ---
  S_PLAY:      { tics: - 1, action: null, next: 'S_PLAY' },
  S_PLAY_RUN1: { tics: 4,   action: null, next: 'S_PLAY_RUN2' },
  S_PLAY_RUN2: { tics: 4,   action: null, next: 'S_PLAY_RUN3' },
  S_PLAY_RUN3: { tics: 4,   action: null, next: 'S_PLAY_RUN4' },
  S_PLAY_RUN4: { tics: 4,   action: null, next: 'S_PLAY_RUN1' },

  // --- Pain ---
  S_PLAY_PAIN:  { tics: 4, action: null,     next: 'S_PLAY_PAIN2' },
  S_PLAY_PAIN2: { tics: 4, action: 'A_Pain', next: 'S_PLAY' },

  // --- Death ---
  S_PLAY_DIE1: { tics: 10, action: null,              next: 'S_PLAY_DIE2' },
  S_PLAY_DIE2: { tics: 10, action: 'A_PlayerScream',  next: 'S_PLAY_DIE3' },
  S_PLAY_DIE3: { tics: 10, action: 'A_Fall',          next: 'S_PLAY_DIE4' },
  S_PLAY_DIE4: { tics: 10, action: null,              next: 'S_PLAY_DIE5' },
  S_PLAY_DIE5: { tics: 10, action: null,              next: 'S_PLAY_DIE6' },
  S_PLAY_DIE6: { tics: 10, action: null,              next: 'S_PLAY_DIE7' },
  S_PLAY_DIE7: { tics: - 1, action: null,             next: 'S_PLAY_DIE7' },

  // --- Gib death (overkill: health < -spawnhealth) ---
  S_PLAY_XDIE1: { tics: 5, action: null,              next: 'S_PLAY_XDIE2' },
  S_PLAY_XDIE2: { tics: 5, action: 'A_XScream',       next: 'S_PLAY_XDIE3' },
  S_PLAY_XDIE3: { tics: 5, action: 'A_Fall',          next: 'S_PLAY_XDIE4' },
  S_PLAY_XDIE4: { tics: 5, action: null,              next: 'S_PLAY_XDIE5' },
  S_PLAY_XDIE5: { tics: 5, action: null,              next: 'S_PLAY_XDIE6' },
  S_PLAY_XDIE6: { tics: 5, action: null,              next: 'S_PLAY_XDIE7' },
  S_PLAY_XDIE7: { tics: 5, action: null,              next: 'S_PLAY_XDIE8' },
  S_PLAY_XDIE8: { tics: 5, action: null,              next: 'S_PLAY_XDIE9' },
  S_PLAY_XDIE9: { tics: - 1, action: null,            next: 'S_PLAY_XDIE9' },

};

// Player mobjinfo constants (from info.c MT_PLAYER)
const PLAYER_PAINCHANCE = 255; // always enters pain state when hit

// ============================================================
// Set player mobj state — mirrors P_SetMobjState for the player
// ============================================================

export function setPlayerMobjState( state: PlayerStatusState, stateName: string ): void {

  let name: string | null = stateName;

  while ( name ) {

    const entry: PlayerStateEntry | undefined = PLAYER_STATES[ name ];
    if ( ! entry ) {

      state.mobjState = { name: 'S_PLAY', tics: - 1 };
      return;

    }

    state.mobjState = { name, tics: entry.tics };

    // Execute action
    if ( entry.action ) execPlayerAction( state, entry.action );

    // If tics > 0 or -1 (infinite), stop and wait
    if ( entry.tics !== 0 ) return;

    name = entry.next;

  }

}

// ============================================================
// Tick the player mobj state — call once per tic
// ============================================================

export function tickPlayerMobjState( state: PlayerStatusState ): void {

  const ms = state.mobjState;
  if ( ms.tics === - 1 ) return; // infinite — no countdown

  ms.tics --;

  if ( ms.tics <= 0 ) {

    const entry = PLAYER_STATES[ ms.name ];
    if ( entry ) setPlayerMobjState( state, entry.next );

  }

}

// ============================================================
// Called when the player takes damage — handles pain state transition
// Mirrors the painchance check in P_DamageMobj
// ============================================================

export function playerPainCheck( state: PlayerStatusState ): void {

  // Player painchance = 255 (always enter pain state)
  if ( ( P_Random() < PLAYER_PAINCHANCE ) ) {

    setPlayerMobjState( state, 'S_PLAY_PAIN' );

  }

}

// ============================================================
// Called when the player dies — handles death state transition
// Mirrors P_KillMobj for the player
// ============================================================

export function playerKilled( state: PlayerStatusState ): void {

  state.playerState = 'PST_DEAD';

  if ( state.health < - 100 ) {

    // Gib death (extreme overkill)
    setPlayerMobjState( state, 'S_PLAY_XDIE1' );

  } else {

    setPlayerMobjState( state, 'S_PLAY_DIE1' );

  }

}

// ============================================================
// Action dispatch
// ============================================================

function execPlayerAction( state: PlayerStatusState, action: string ): void {

  switch ( action ) {

    case 'A_Pain':
      playSound( 'plpain' );
      break;

    case 'A_PlayerScream':
      // TODO: if health < -50, play sfx_slop (gib sound) instead
      playSound( 'pldeth' );
      break;

    case 'A_XScream':
      playSound( 'slop' );
      break;

    case 'A_Fall':
      // In original: removes MF_SOLID from player mobj
      // For us this means the player is no longer blocking
      break;

  }

}
