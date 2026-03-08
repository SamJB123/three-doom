// Player damage and environmental hazards — ported from p_inter.c / p_spec.c.
// Handles armor absorption, damage tint, damaging floors, and explosion damage to player.

import type { PlayerStatusState } from '../ecs/traits';
import type { DoomPlayer, DoomMapData } from '../physics/DoomMovement';
import { findSectorAtFixed } from '../physics/DoomMovement';
import type { Mobj } from './Mobj';
import { P_Random } from './DoomRandom';
import { FRACBITS } from '../math/fixed';
import { playerPainCheck, playerKilled } from './PlayerState';

// ============================================================
// P_DamageMobj for the player — ported from p_inter.c
// ============================================================

/**
 * Apply damage to the player with armor absorption.
 * source: who caused the damage (for attacker tracking), null = environment
 */
export function damagePlayer(
  state: PlayerStatusState,
  damage: number
): void {

  if ( state.health <= 0 ) return;

  // God mode blocks all damage
  if ( state.godMode ) return;

  // Invulnerability blocks all damage (except type-11 exit sectors)
  if ( state.powers.invulnerability > 0 ) return;

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

  // Damage red tint — applied before death check (matches original)
  state.damageCount += damage;
  if ( state.damageCount > 100 ) state.damageCount = 100;

  if ( state.health <= 0 ) {

    // Player dies — transition to death state
    playerKilled( state );
    return;

  }

  // Pain state check — player painchance is 255 (near-always)
  if ( damage > 0 ) playerPainCheck( state );

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

          damagePlayer( state, 10 );

        }

      }

      break;

    case 7:
      // NUKAGE — 5 damage every 32 tics
      if ( ! state.powers.ironfeet ) {

        if ( ! ( levelTime & 0x1F ) ) {

          damagePlayer( state, 5 );

        }

      }

      break;

    case 4:
    case 16:
      // STROBE HURT / SUPER HELLSLIME — 20 damage every 32 tics
      // Radiation suit protects with 5% bypass chance
      if ( ! state.powers.ironfeet || P_Random() < 5 ) {

        if ( ! ( levelTime & 0x1F ) ) {

          damagePlayer( state, 20 );

        }

      }

      break;

    case 9:
      // SECRET — one-time discovery
      // Clear the special so it only triggers once
      sector.special = 0;
      // TODO: increment secretcount
      break;

    case 11:
      // EXIT SUPER DAMAGE — 20 damage, ignores godmode, forces exit at ≤10 HP
      if ( ! ( levelTime & 0x1F ) ) {

        damagePlayer( state, 20 );

      }

      if ( state.health <= 10 ) {

        // TODO: trigger level exit (G_ExitLevel)

      }

      break;

  }

}

// ============================================================
// Explosion damage to player — called from P_RadiusAttack
// ============================================================

export function radiusAttackPlayer(
  player: DoomPlayer,
  state: PlayerStatusState,
  spot: Mobj,
  _source: Mobj | null,
  damage: number
): void {

  // Chebyshev distance from explosion center to player
  const dx = Math.abs( player.mo.x - spot.x );
  const dy = Math.abs( player.mo.y - spot.y );
  let dist = ( ( dx > dy ? dx : dy ) >> FRACBITS ) - ( player.mo.radius >> FRACBITS );
  if ( dist < 0 ) dist = 0;

  // Out of range?
  if ( dist >= damage ) return;

  // Apply damage with distance falloff
  damagePlayer( state, damage - dist );

}
