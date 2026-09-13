// Mobj type definitions, state tables, and mobjinfo — ported from info.c/info.h.
// Includes all monster, projectile, and effect types.

import type { Fixed } from '../math/fixed';
import { FRACUNIT } from '../math/fixed';

// ============================================================
// Mobj flags (from d_think.h / info.h)
// ============================================================

export const MF_SPECIAL    = 0x000001; // Call P_SpecialThing when touched
export const MF_SOLID      = 0x000002; // Blocks movement
export const MF_SHOOTABLE  = 0x000004; // Can be damaged
export const MF_NOSECTOR   = 0x000008; // Don't link to sector
export const MF_NOBLOCKMAP = 0x000010; // Don't link to blockmap
export const MF_AMBUSH     = 0x000020; // Deaf monster
export const MF_JUSTHIT    = 0x000040; // Will try to attack right back
export const MF_JUSTATTACKED = 0x000080; // Delay attack
export const MF_SPAWNCEILING = 0x000100; // Hang from ceiling
export const MF_NOGRAVITY  = 0x000200; // No gravity
export const MF_DROPOFF    = 0x000400; // Can jump off tall things
export const MF_PICKUP     = 0x000800; // For players to pick up items
export const MF_NOCLIP     = 0x001000; // No clipping
export const MF_FLOAT      = 0x004000; // Float toward target
export const MF_TELEPORT   = 0x008000; // Don't cross special lines
export const MF_MISSILE    = 0x010000; // Don't hit same species, explode on block
export const MF_DROPPED    = 0x020000; // Dropped by a demon
export const MF_SHADOW     = 0x040000; // Partial invisibility (spectre)
export const MF_NOBLOOD    = 0x080000; // Don't bleed when shot
export const MF_CORPSE     = 0x100000; // Don't stop moving halfway off a step
export const MF_INFLOAT    = 0x200000; // Don't auto-float to target's height
export const MF_COUNTKILL  = 0x400000; // Count toward kill %
export const MF_COUNTITEM  = 0x800000; // Count toward item %
export const MF_SKULLFLY   = 0x1000000; // Lost soul attack mode
export const MF_NOTDMATCH  = 0x2000000; // Not spawned in deathmatch

// ============================================================
// Mobj state definition
// ============================================================

export interface MobjState {
  sprite: string;         // 4-letter WAD sprite prefix
  frame: number;          // frame index (0=A, 1=B, etc.)
  bright: boolean;        // FF_FULLBRIGHT
  tics: number;           // duration (-1 = infinite)
  action: string | null;  // action function name
  next: string;           // next state name
}

// ============================================================
// Mobj info (from mobjinfo[] in info.c)
// ============================================================

export interface MobjInfo {
  doomedNum: number;        // WAD editor number (-1 = not placeable)
  spawnState: string;
  spawnHealth: number;
  seeState: string | null;
  painState: string | null;
  painChance: number;       // 0–255
  meleeState: string | null;
  missileState: string | null;
  deathState: string;
  xDeathState: string | null;
  raiseState: string | null;
  seeSound: string | null;
  attackSound: string | null;
  painSound: string | null;
  deathSound: string | null;
  activeSound: string | null;
  speed: number; // Integer map units for monsters; fixed-point for missiles.
  radius: Fixed;
  height: Fixed;
  mass: number;
  damage: number;
  flags: number;
}

// Source tables are generated, rather than hand-transcribed, so decorative
// actors, pickups and death frames retain their original state metadata.
import {SOURCE_STATES,SOURCE_TYPES} from './SourceMobjData';
export const MOBJ_STATES:Record<string,MobjState> = SOURCE_STATES;
export const MOBJ_TYPES:Record<string,MobjInfo> = SOURCE_TYPES;
export const DOOMEDNUM_TO_TYPE:Record<number,string> = {};
for(const [name,info] of Object.entries(MOBJ_TYPES))if(info.doomedNum>=0)DOOMEDNUM_TO_TYPE[info.doomedNum]=name;
