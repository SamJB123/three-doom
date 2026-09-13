import {wakeAfterDamage} from './DamageResponse';
import type {Mobj} from './Mobj';
// Player damage and environmental hazards — ported from p_inter.c / p_spec.c.
// Handles armor absorption, damage tint, damaging floors, and explosion damage to player.

import type { PlayerStatusState } from '../ecs/traits';
import type { DoomPlayer, DoomMapData } from '../physics/DoomMovement';
import { findSectorAtFixed } from '../physics/DoomMovement';
import { requestExit } from './UseAction';
import { gameRules } from './GameRules';
import { P_Random } from './DoomRandom';
import { playerPainCheck, playerKilled, setPlayerMobjState } from './PlayerState';

let deathCallback:((state:PlayerStatusState)=>void)|null=null;
export function setPlayerDeathCallback(callback:(state:PlayerStatusState)=>void):void {deathCallback=callback;}

let secretCallback: (() => void) | null = null;
export function setSecretCallback(cb: () => void): void { secretCallback=cb; }

// ============================================================
// P_DamageMobj for the player — ported from p_inter.c
// ============================================================

/**
 * Apply damage to the player with armor absorption.
 * source: who caused the damage (for attacker tracking), null = environment
 */
export function damagePlayer(
  state: PlayerStatusState,
  damage: number,
  sectorSpecial = 0,
  actor?:Mobj,
  source:Mobj|null=null
): boolean {

  if ( state.health <= 0 ) return false;

  if (gameRules.skill === 1) damage >>= 1;

  // P_DamageMobj's E1M8 hell-exit protection precedes armor and cheats.
  if (sectorSpecial === 11 && damage >= state.health) damage = state.health - 1;
  if (damage < 1000 && (state.godMode || state.powers.invulnerability > 0)) return false;

  // Armor absorbs damage: blue=1/3, mega/red=1/2
  if ( state.armorType > 0 ) {

    let saved: number;

    if ( state.armorType === 1 ) {

      saved = ( damage / 3 ) | 0;

    } else {

      saved = ( damage / 2 ) | 0;

    }

    if ( state.armor <= saved ) {

      // Armor is exhausted
      saved = state.armor;
      state.armorType = 0;

    }

    state.armor -= saved;
    damage -= saved;

  }

  state.health -= damage;
  if(actor)actor.health=state.health;

  // Damage red tint — applied before death check (matches original)
  state.damageCount += damage;
  if ( state.damageCount > 100 ) state.damageCount = 100;

  if ( state.health <= 0 ) {

    // Player dies — transition to death state
    playerKilled( state, actor );
    state.health = 0;
    deathCallback?.(state);
    return true;

  }

  // Pain state check — player painchance is 255 (near-always)
  playerPainCheck( state, actor );
  if(actor)wakeAfterDamage(actor,source,name=>setPlayerMobjState(state,name,actor));
  return true;

}

// ============================================================
// P_PlayerInSpecialSector — ported from p_spec.c
// Called once per tic. Checks if the player is standing on a
// damaging floor and applies damage accordingly.
// ============================================================

export function playerInSpecialSector(
  player: DoomPlayer,
  state: PlayerStatusState,
  map: DoomMapData,
  levelTime: number
): void {

  // Find the sector the player is currently in
  const sector = findSectorAtFixed( player.mo.x, player.mo.y, map );
  if ( ! sector ) return;

  // Player must be on the floor to take sector damage
  if ( player.mo.z !== player.mo.floorz ) return;

  const sType = sector.special;
  if ( sType === 0 ) return;

  switch ( sType ) {

    case 5:
      // HELLSLIME — 10 damage every 32 tics
      if ( ! state.powers.ironfeet ) {

        if ( ! ( levelTime & 0x1F ) ) {

          damagePlayer( state, 10, sector.special, player.mo );

        }

      }

      break;

    case 7:
      // NUKAGE — 5 damage every 32 tics
      if ( ! state.powers.ironfeet ) {

        if ( ! ( levelTime & 0x1F ) ) {

          damagePlayer( state, 5, sector.special, player.mo );

        }

      }

      break;

    case 4:
    case 16:
      // STROBE HURT / SUPER HELLSLIME — 20 damage every 32 tics
      // Radiation suit protects with 5% bypass chance
      if ( ! state.powers.ironfeet || P_Random() < 5 ) {

        if ( ! ( levelTime & 0x1F ) ) {

          damagePlayer( state, 20, sector.special, player.mo );

        }

      }

      break;

    case 9:
      // SECRET — one-time discovery
      // Clear the special so it only triggers once
      sector.special = 0;
      secretCallback?.();
      break;

    case 11:
      state.godMode = false;
      // EXIT SUPER DAMAGE — 20 damage, ignores godmode, forces exit at ≤10 HP
      if ( ! ( levelTime & 0x1F ) ) {

        damagePlayer( state, 20, sector.special, player.mo );

      }

      if ( state.health <= 10 ) {

        requestExit();

      }

      break;

  }

}
