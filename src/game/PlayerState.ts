import type {Mobj} from './Mobj';
import {MOBJ_STATES,MF_JUSTHIT,MF_SOLID,MF_SHOOTABLE,MF_FLOAT,MF_SKULLFLY,MF_NOGRAVITY,MF_CORPSE,MF_DROPOFF} from './MobjData';
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

const PLAYER_STATES = MOBJ_STATES;

// Player mobjinfo constants (from info.c MT_PLAYER)
const PLAYER_PAINCHANCE = 255; // all random values except 255 enter pain

// ============================================================
// Set player mobj state — mirrors P_SetMobjState for the player
// ============================================================

export function setPlayerMobjState( state: PlayerStatusState, stateName: string, actor?:Mobj ): void {

  let name: string | null = stateName;

  while ( name ) {

    const entry: PlayerStateEntry | undefined = PLAYER_STATES[ name ];
    if ( ! entry ) {

      state.mobjState = { name: 'S_PLAY', tics: - 1 };
      return;

    }

    state.mobjState = { name, tics: entry.tics };
    if(actor){actor.state=name;actor.tics=entry.tics;}

    // Execute action
    if ( entry.action ) execPlayerAction( state, entry.action, actor );

    // If tics > 0 or -1 (infinite), stop and wait
    if ( entry.tics !== 0 ) return;

    name = entry.next;

  }

}

// ============================================================
// Tick the player mobj state — call once per tic
// ============================================================

export function tickPlayerMobjState( state: PlayerStatusState, actor?:Mobj ): void {

  if(actor?.state==='S_GIBS')state.mobjState={name:'S_GIBS',tics:actor.tics};
  const ms = state.mobjState;
  if ( ms.tics === - 1 ) return; // infinite — no countdown

  ms.tics --;
  if(actor)actor.tics=ms.tics;

  if ( ms.tics <= 0 ) {

    const entry = PLAYER_STATES[ ms.name ];
    if ( entry ) setPlayerMobjState( state, entry.next, actor );

  }

}

// ============================================================
// Called when the player takes damage — handles pain state transition
// Mirrors the painchance check in P_DamageMobj
// ============================================================

export function playerPainCheck( state: PlayerStatusState, actor?:Mobj ): void {

  // P_DamageMobj marks a successful pain roll before entering the state.
  if ( ( P_Random() < PLAYER_PAINCHANCE ) ) {

    if(actor)actor.flags|=MF_JUSTHIT;
    setPlayerMobjState( state, 'S_PLAY_PAIN', actor );

  }

}

// ============================================================
// Called when the player dies — handles death state transition
// Mirrors P_KillMobj for the player
// ============================================================

export function playerKilled( state: PlayerStatusState, actor?:Mobj ): void {

  state.playerState = 'PST_DEAD';
  if(actor){actor.flags=(actor.flags&~(MF_SOLID|MF_SHOOTABLE|MF_FLOAT|MF_SKULLFLY|MF_NOGRAVITY))|MF_CORPSE|MF_DROPOFF;actor.height>>=2;}

  if ( state.health < - 100 ) {

    // Gib death (extreme overkill)
    setPlayerMobjState( state, 'S_PLAY_XDIE1', actor );

  } else {

    setPlayerMobjState( state, 'S_PLAY_DIE1', actor );

  }

  state.mobjState.tics=Math.max(1,state.mobjState.tics-(P_Random()&3));
  if(actor)actor.tics=state.mobjState.tics;
}

// ============================================================
// Action dispatch
// ============================================================

function execPlayerAction( state: PlayerStatusState, action: string, actor?:Mobj ): void {

  switch ( action ) {

    case 'A_Pain':
      playSound( 'plpain' );
      break;

    case 'A_PlayerScream':
      // Ultimate Doom uses pldeth; the alternate scream is commercial-only.
      playSound( 'pldeth' );
      break;

    case 'A_XScream':
      playSound( 'slop' );
      break;

    case 'A_Fall':
      if(actor)actor.flags &= ~MF_SOLID;
      break;

  }

}
