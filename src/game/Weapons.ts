import {pointToRadians} from '../math/angles';
import {setPlayerMobjState} from './PlayerState';
import type {Mobj} from './Mobj';
import {finesine} from '../math/AngleTables';
// Weapon system — ported from p_pspr.c
// Manages psprite state machine, weapon switching, firing, and ammo consumption.

import type { World } from 'koota';
import type { WeaponSlot, AmmoType, PlayerStatusState } from '../ecs/traits';
import { PlayerStatus, Input, DoomWorld, Time } from '../ecs/traits';
import { playSound } from '../sound';
import type { Fixed } from '../math/fixed';
import { FRACUNIT, fixedMul, floatToFixed } from '../math/fixed';
import { P_Random } from './DoomRandom';

// ============================================================
// Constants (from p_pspr.c) — fixed-point screen-space units
// ============================================================

const LOWERSPEED = 6 * FRACUNIT;   // units per tic weapon lowers
const RAISESPEED = 6 * FRACUNIT;   // units per tic weapon raises
const WEAPONBOTTOM = 128 * FRACUNIT;  // off-screen bottom position
const WEAPONTOP = 32 * FRACUNIT;      // ready position
const BFGCELLS = 40;                   // ammo per BFG shot

// ============================================================
// Weapon info table (from d_items.c)
// ============================================================

export interface WeaponInfo {
  ammo: AmmoType | null;    // null = no ammo needed (fist, chainsaw)
  upState: string;
  downState: string;
  readyState: string;
  atkState: string;
  flashState: string | null;
}

export const WEAPON_INFO: Record<WeaponSlot, WeaponInfo> = {
  fist:         { ammo: null,   upState: 'PUNCHUP',      downState: 'PUNCHDOWN',    readyState: 'PUNCH',     atkState: 'PUNCH1',      flashState: null },
  pistol:       { ammo: 'clip', upState: 'PISTOLUP',     downState: 'PISTOLDOWN',   readyState: 'PISTOL',    atkState: 'PISTOL1',     flashState: 'PISTOLFLASH' },
  shotgun:      { ammo: 'shell',upState: 'SGUNUP',       downState: 'SGUNDOWN',     readyState: 'SGUN',      atkState: 'SGUN1',       flashState: 'SGUNFLASH1' },
  chaingun:     { ammo: 'clip', upState: 'CHAINUP',      downState: 'CHAINDOWN',    readyState: 'CHAIN',     atkState: 'CHAIN1',      flashState: 'CHAINFLASH1' },
  missile:      { ammo: 'misl', upState: 'MISSILEUP',    downState: 'MISSILEDOWN',  readyState: 'MISSILE',   atkState: 'MISSILE1',    flashState: 'MISSILEFLASH1' },
  plasma:       { ammo: 'cell', upState: 'PLASMAUP',     downState: 'PLASMADOWN',   readyState: 'PLASMA',    atkState: 'PLASMA1',     flashState: 'PLASMAFLASH1' },
  bfg:          { ammo: 'cell', upState: 'BFGUP',        downState: 'BFGDOWN',      readyState: 'BFG',       atkState: 'BFG1',        flashState: 'BFGFLASH1' },
  chainsaw:     { ammo: null,   upState: 'SAWUP',        downState: 'SAWDOWN',      readyState: 'SAW',       atkState: 'SAW1',        flashState: null },
  supershotgun: { ammo: 'shell',upState: 'DSGUNUP',      downState: 'DSGUNDOWN',    readyState: 'DSGUN',     atkState: 'DSGUN1',      flashState: 'DSGUNFLASH1' },
};

// Weapon slot mapping: 1 = fist/chainsaw, 2-7 = pistol through BFG (original Doom)
const WEAPON_KEY_SLOTS: Record<number, WeaponSlot[]> = {
  1: [ 'fist', 'chainsaw' ],
  8: [ 'chainsaw' ], // explicit touch-wheel choices
  9: [ 'supershotgun' ],
  2: [ 'pistol' ],
  3: [ 'shotgun', 'supershotgun' ],
  4: [ 'chaingun' ],
  5: [ 'missile' ],
  6: [ 'plasma' ],
  7: [ 'bfg' ],
};

// ============================================================
// Weapon states — ported from info.c
// Each state: sprite prefix, frame, tics, action, nextState
// ============================================================

export interface WeaponState {
  sprite: string;     // WAD sprite prefix (e.g., 'PISG')
  frame: number;      // frame index (0=A, 1=B, etc.)
  bright: boolean;    // full brightness (FF_FULLBRIGHT)
  tics: number;       // duration (-1 = infinite)
  action: string | null; // action function name
  next: string;       // next state name
}

const STATES: Record<string, WeaponState> = {

  // --- Fist / Punch ---
  PUNCH:       { sprite: 'PUNG', frame: 0, bright: false, tics: 1,  action: 'A_WeaponReady', next: 'PUNCH' },
  PUNCHDOWN:   { sprite: 'PUNG', frame: 0, bright: false, tics: 1,  action: 'A_Lower',       next: 'PUNCHDOWN' },
  PUNCHUP:     { sprite: 'PUNG', frame: 0, bright: false, tics: 1,  action: 'A_Raise',       next: 'PUNCHUP' },
  PUNCH1:      { sprite: 'PUNG', frame: 1, bright: false, tics: 4,  action: null,            next: 'PUNCH2' },
  PUNCH2:      { sprite: 'PUNG', frame: 2, bright: false, tics: 4,  action: 'A_Punch',       next: 'PUNCH3' },
  PUNCH3:      { sprite: 'PUNG', frame: 3, bright: false, tics: 5,  action: null,            next: 'PUNCH4' },
  PUNCH4:      { sprite: 'PUNG', frame: 2, bright: false, tics: 4,  action: null,            next: 'PUNCH5' },
  PUNCH5:      { sprite: 'PUNG', frame: 1, bright: false, tics: 5,  action: 'A_ReFire',      next: 'PUNCH' },

  // --- Pistol ---
  PISTOL:      { sprite: 'PISG', frame: 0, bright: false, tics: 1,  action: 'A_WeaponReady', next: 'PISTOL' },
  PISTOLDOWN:  { sprite: 'PISG', frame: 0, bright: false, tics: 1,  action: 'A_Lower',       next: 'PISTOLDOWN' },
  PISTOLUP:    { sprite: 'PISG', frame: 0, bright: false, tics: 1,  action: 'A_Raise',       next: 'PISTOLUP' },
  PISTOL1:     { sprite: 'PISG', frame: 0, bright: false, tics: 4,  action: null,            next: 'PISTOL2' },
  PISTOL2:     { sprite: 'PISG', frame: 1, bright: false, tics: 6,  action: 'A_FirePistol',  next: 'PISTOL3' },
  PISTOL3:     { sprite: 'PISG', frame: 2, bright: false, tics: 4,  action: null,            next: 'PISTOL4' },
  PISTOL4:     { sprite: 'PISG', frame: 1, bright: false, tics: 5,  action: 'A_ReFire',      next: 'PISTOL' },
  PISTOLFLASH: { sprite: 'PISF', frame: 0, bright: true,  tics: 7,  action: 'A_Light1',      next: 'LIGHTDONE' },

  // --- Shotgun ---
  SGUN:        { sprite: 'SHTG', frame: 0, bright: false, tics: 1,  action: 'A_WeaponReady', next: 'SGUN' },
  SGUNDOWN:    { sprite: 'SHTG', frame: 0, bright: false, tics: 1,  action: 'A_Lower',       next: 'SGUNDOWN' },
  SGUNUP:      { sprite: 'SHTG', frame: 0, bright: false, tics: 1,  action: 'A_Raise',       next: 'SGUNUP' },
  SGUN1:       { sprite: 'SHTG', frame: 0, bright: false, tics: 3,  action: null,            next: 'SGUN2' },
  SGUN2:       { sprite: 'SHTG', frame: 0, bright: false, tics: 7,  action: 'A_FireShotgun', next: 'SGUN3' },
  SGUN3:       { sprite: 'SHTG', frame: 1, bright: false, tics: 5,  action: null,            next: 'SGUN4' },
  SGUN4:       { sprite: 'SHTG', frame: 2, bright: false, tics: 5,  action: null,            next: 'SGUN5' },
  SGUN5:       { sprite: 'SHTG', frame: 3, bright: false, tics: 4,  action: null,            next: 'SGUN6' },
  SGUN6:       { sprite: 'SHTG', frame: 2, bright: false, tics: 5,  action: null,            next: 'SGUN7' },
  SGUN7:       { sprite: 'SHTG', frame: 1, bright: false, tics: 5,  action: null,            next: 'SGUN8' },
  SGUN8:       { sprite: 'SHTG', frame: 0, bright: false, tics: 3,  action: null,            next: 'SGUN9' },
  SGUN9:       { sprite: 'SHTG', frame: 0, bright: false, tics: 7,  action: 'A_ReFire',      next: 'SGUN' },
  SGUNFLASH1:  { sprite: 'SHTF', frame: 0, bright: true,  tics: 4,  action: 'A_Light1',      next: 'SGUNFLASH2' },
  SGUNFLASH2:  { sprite: 'SHTF', frame: 1, bright: true,  tics: 3,  action: 'A_Light2',      next: 'LIGHTDONE' },

  // --- Chaingun ---
  CHAIN:       { sprite: 'CHGG', frame: 0, bright: false, tics: 1,  action: 'A_WeaponReady', next: 'CHAIN' },
  CHAINDOWN:   { sprite: 'CHGG', frame: 0, bright: false, tics: 1,  action: 'A_Lower',       next: 'CHAINDOWN' },
  CHAINUP:     { sprite: 'CHGG', frame: 0, bright: false, tics: 1,  action: 'A_Raise',       next: 'CHAINUP' },
  CHAIN1:      { sprite: 'CHGG', frame: 0, bright: false, tics: 4,  action: 'A_FireCGun',    next: 'CHAIN2' },
  CHAIN2:      { sprite: 'CHGG', frame: 1, bright: false, tics: 4,  action: 'A_FireCGun',    next: 'CHAIN3' },
  CHAIN3:      { sprite: 'CHGG', frame: 1, bright: false, tics: 0,  action: 'A_ReFire',      next: 'CHAIN' },
  CHAINFLASH1: { sprite: 'CHGF', frame: 0, bright: true,  tics: 5,  action: 'A_Light1',      next: 'LIGHTDONE' },
  CHAINFLASH2: { sprite: 'CHGF', frame: 1, bright: true,  tics: 5,  action: 'A_Light2',      next: 'LIGHTDONE' },

  // --- Missile launcher ---
  MISSILE:       { sprite: 'MISG', frame: 0, bright: false, tics: 1,  action: 'A_WeaponReady', next: 'MISSILE' },
  MISSILEDOWN:   { sprite: 'MISG', frame: 0, bright: false, tics: 1,  action: 'A_Lower',       next: 'MISSILEDOWN' },
  MISSILEUP:     { sprite: 'MISG', frame: 0, bright: false, tics: 1,  action: 'A_Raise',       next: 'MISSILEUP' },
  MISSILE1:      { sprite: 'MISG', frame: 1, bright: false, tics: 8,  action: 'A_GunFlash',    next: 'MISSILE2' },
  MISSILE2:      { sprite: 'MISG', frame: 1, bright: false, tics: 12, action: 'A_FireMissile', next: 'MISSILE3' },
  MISSILE3:      { sprite: 'MISG', frame: 1, bright: false, tics: 0,  action: 'A_ReFire',      next: 'MISSILE' },
  MISSILEFLASH1: { sprite: 'MISF', frame: 0, bright: true,  tics: 3,  action: 'A_Light1',      next: 'MISSILEFLASH2' },
  MISSILEFLASH2: { sprite: 'MISF', frame: 1, bright: true,  tics: 4,  action: null,            next: 'MISSILEFLASH3' },
  MISSILEFLASH3: { sprite: 'MISF', frame: 2, bright: true,  tics: 4,  action: 'A_Light2',      next: 'MISSILEFLASH4' },
  MISSILEFLASH4: { sprite: 'MISF', frame: 3, bright: true,  tics: 4,  action: 'A_Light2',      next: 'LIGHTDONE' },

  // --- Chainsaw ---
  SAW:       { sprite: 'SAWG', frame: 2, bright: false, tics: 4, action: 'A_WeaponReady', next: 'SAWB' },
  SAWB:      { sprite: 'SAWG', frame: 3, bright: false, tics: 4, action: 'A_WeaponReady', next: 'SAW' },
  SAWDOWN:   { sprite: 'SAWG', frame: 2, bright: false, tics: 1, action: 'A_Lower',       next: 'SAWDOWN' },
  SAWUP:     { sprite: 'SAWG', frame: 2, bright: false, tics: 1, action: 'A_Raise',       next: 'SAWUP' },
  SAW1:      { sprite: 'SAWG', frame: 0, bright: false, tics: 4, action: 'A_Saw',         next: 'SAW2' },
  SAW2:      { sprite: 'SAWG', frame: 1, bright: false, tics: 4, action: 'A_Saw',         next: 'SAW3' },
  SAW3:      { sprite: 'SAWG', frame: 1, bright: false, tics: 0, action: 'A_ReFire',      next: 'SAW' },

  // --- Plasma rifle ---
  PLASMA:       { sprite: 'PLSG', frame: 0, bright: false, tics: 1,  action: 'A_WeaponReady', next: 'PLASMA' },
  PLASMADOWN:   { sprite: 'PLSG', frame: 0, bright: false, tics: 1,  action: 'A_Lower',       next: 'PLASMADOWN' },
  PLASMAUP:     { sprite: 'PLSG', frame: 0, bright: false, tics: 1,  action: 'A_Raise',       next: 'PLASMAUP' },
  PLASMA1:      { sprite: 'PLSG', frame: 0, bright: false, tics: 3,  action: 'A_FirePlasma',  next: 'PLASMA2' },
  PLASMA2:      { sprite: 'PLSG', frame: 1, bright: false, tics: 20, action: 'A_ReFire',      next: 'PLASMA' },
  PLASMAFLASH1: { sprite: 'PLSF', frame: 0, bright: true,  tics: 4,  action: 'A_Light1',      next: 'LIGHTDONE' },
  PLASMAFLASH2: { sprite: 'PLSF', frame: 1, bright: true,  tics: 4,  action: 'A_Light1',      next: 'LIGHTDONE' },

  // --- BFG ---
  BFG:       { sprite: 'BFGG', frame: 0, bright: false, tics: 1,  action: 'A_WeaponReady', next: 'BFG' },
  BFGDOWN:   { sprite: 'BFGG', frame: 0, bright: false, tics: 1,  action: 'A_Lower',       next: 'BFGDOWN' },
  BFGUP:     { sprite: 'BFGG', frame: 0, bright: false, tics: 1,  action: 'A_Raise',       next: 'BFGUP' },
  BFG1:      { sprite: 'BFGG', frame: 0, bright: false, tics: 20, action: 'A_BFGsound',    next: 'BFG2' },
  BFG2:      { sprite: 'BFGG', frame: 1, bright: false, tics: 10, action: 'A_GunFlash',    next: 'BFG3' },
  BFG3:      { sprite: 'BFGG', frame: 1, bright: false, tics: 10, action: 'A_FireBFG',     next: 'BFG4' },
  BFG4:      { sprite: 'BFGG', frame: 1, bright: false, tics: 20, action: 'A_ReFire',      next: 'BFG' },
  BFGFLASH1: { sprite: 'BFGF', frame: 0, bright: true,  tics: 11, action: 'A_Light1',      next: 'BFGFLASH2' },
  BFGFLASH2: { sprite: 'BFGF', frame: 1, bright: true,  tics: 6,  action: 'A_Light2',      next: 'LIGHTDONE' },

  // --- Super Shotgun ---
  DSGUN:       { sprite: 'SHT2', frame: 0, bright: false, tics: 1, action: 'A_WeaponReady',   next: 'DSGUN' },
  DSGUNDOWN:   { sprite: 'SHT2', frame: 0, bright: false, tics: 1, action: 'A_Lower',         next: 'DSGUNDOWN' },
  DSGUNUP:     { sprite: 'SHT2', frame: 0, bright: false, tics: 1, action: 'A_Raise',         next: 'DSGUNUP' },
  DSGUN1:      { sprite: 'SHT2', frame: 0, bright: false, tics: 3, action: null,              next: 'DSGUN2' },
  DSGUN2:      { sprite: 'SHT2', frame: 0, bright: false, tics: 7, action: 'A_FireShotgun2',  next: 'DSGUN3' },
  DSGUN3:      { sprite: 'SHT2', frame: 1, bright: false, tics: 7, action: null,              next: 'DSGUN4' },
  DSGUN4:      { sprite: 'SHT2', frame: 2, bright: false, tics: 7, action: 'A_CheckReload',   next: 'DSGUN5' },
  DSGUN5:      { sprite: 'SHT2', frame: 3, bright: false, tics: 7, action: 'A_OpenShotgun2',  next: 'DSGUN6' },
  DSGUN6:      { sprite: 'SHT2', frame: 4, bright: false, tics: 7, action: null,              next: 'DSGUN7' },
  DSGUN7:      { sprite: 'SHT2', frame: 5, bright: false, tics: 7, action: 'A_LoadShotgun2',  next: 'DSGUN8' },
  DSGUN8:      { sprite: 'SHT2', frame: 6, bright: false, tics: 6, action: null,              next: 'DSGUN9' },
  DSGUN9:      { sprite: 'SHT2', frame: 7, bright: false, tics: 6, action: 'A_CloseShotgun2', next: 'DSGUN10' },
  DSGUN10:     { sprite: 'SHT2', frame: 0, bright: false, tics: 5, action: 'A_ReFire',        next: 'DSGUN' },
  DSGUNFLASH1: { sprite: 'SHT2', frame: 8, bright: true,  tics: 5, action: 'A_Light1',        next: 'DSGUNFLASH2' },
  DSGUNFLASH2: { sprite: 'SHT2', frame: 9, bright: true,  tics: 4, action: 'A_Light2',        next: 'LIGHTDONE' },

  // --- Shared ---
  LIGHTDONE: { sprite: 'SHTG', frame: 0, bright: false, tics: 0, action: 'A_Light0', next: 'NULL' },
};

// ============================================================
// PSprite definition
// ============================================================

interface PSpriteDef {
  state: string | null;   // current state name (null = inactive)
  tics: number;
  sx: Fixed;              // x position (fixed-point screen units)
  sy: Fixed;              // y position (fixed-point screen units)
}

// ============================================================
// Weapon system singleton
// ============================================================

/** Callback for weapon fire — receives angle (radians), slope (fixed), damage */
export type FireCallback = ( angle: number, slope: Fixed, damage: number, range: Fixed ) => Mobj | null | void;

/** Callback for projectile weapon fire — receives angle (radians) and mobj type name */
export type MissileCallback = ( angle: number, typeName: string ) => void;

export class WeaponSystem {
  private bob:Fixed=0;
  private levelTime=0;

  psprites: [ PSpriteDef, PSpriteDef ] = [
    { state: null, tics: 0, sx: 0, sy: WEAPONTOP },   // ps_weapon
    { state: null, tics: 0, sx: 0, sy: WEAPONTOP },   // ps_flash
  ];

  archive() {return structuredClone({psprites:this.psprites,attackDown:this.attackDown,refire:this.refire,lastAngle:this.lastAngle});}
  restore(saved: ReturnType<WeaponSystem['archive']>): void {
    this.psprites=structuredClone(saved.psprites);this.attackDown=saved.attackDown;this.refire=Number(saved.refire);this.lastAngle=saved.lastAngle;
  }
  private attackDown = false;
  private attackHeld = false;
  private playerActor:Mobj|undefined;
  private refire = 0;
  private aimCallback: ((angle: number, range: Fixed) => Fixed) | null = null;
  private bulletAimCallback:((angle:number)=>Fixed)|null=null;
  setBulletAimCallback(cb:(angle:number)=>Fixed):void {this.bulletAimCallback=cb;}
  private getBulletSlope():Fixed {return this.bulletAimCallback?.(this.lastAngle)??this.aimCallback?.(this.lastAngle,1024*FRACUNIT)??0;}
  private noiseCallback: (() => void) | null = null;
  setAimCallback(cb: (angle: number, range: Fixed) => Fixed): void { this.aimCallback = cb; }
  setNoiseCallback(cb: () => void): void { this.noiseCallback = cb; }
  private fireCallback: FireCallback | null = null;
  private missileCallback: MissileCallback | null = null;
  private lastAngle = 0; // player aim angle in radians (Doom-space)

  /** Register callback for projectile weapon fire */
  setMissileCallback( cb: MissileCallback ): void {

    this.missileCallback = cb;

  }

  /** Register callback for hitscan weapon fire */
  setFireCallback( cb: FireCallback ): void {

    this.fireCallback = cb;

  }

  /** Initialize weapon for level start */
  setup( state: PlayerStatusState ): void {

    state.pendingWeapon = null;
    this.bringUpWeapon( state );

  }

  /** P_DropWeapon interrupts an attack immediately on death. */
  drop(state:PlayerStatusState):void {
    this.setPsprite(state,0,WEAPON_INFO[state.currentWeapon].downState);
  }

  /** Run one tic of weapon logic — called at 35Hz */
  tick( world: World ): void {

    const state = world.get( PlayerStatus );
    const input = world.get( Input );
    if ( ! state || ! input ) return;

    this.attackHeld=input.attack;
    this.playerActor=world.get(DoomWorld)?.player?.mo;
    this.bob=world.get(DoomWorld)?.player?.bob??0;
    this.levelTime=world.get(Time)?.levelTime??0;

    // Track player aim angle (convert Three.js yaw to Doom angle)
    this.lastAngle = this.playerActor?.angle ?? input.yaw + Math.PI / 2;

    // Handle weapon select input
    const candidates = WEAPON_KEY_SLOTS[ input.weaponSelect ];

    if ( candidates ) {

      for ( const w of candidates ) {

        if ( state.weapons[ w ] && w !== state.currentWeapon ) {

          // P_PlayerThink allows selecting an owned empty weapon. Ammo is
          // checked when firing, not when requesting a manual weapon change.
          state.pendingWeapon = w;
          break;

        }

      }

      // Toggle between fist/chainsaw on key 1
      if ( input.weaponSelect === 1 && state.pendingWeapon === null ) {

        const alt = state.currentWeapon === 'fist' ? 'chainsaw' : 'fist';
        if ( state.weapons[ alt ] ) state.pendingWeapon = alt;

      }

    }

    // Process psprite state machines
    this.movePsprites( state );

  }

  /** Get the current weapon sprite info for rendering */
  getWeaponSprite(): { sprite: string; frame: number; bright: boolean; sx: Fixed; sy: Fixed } | null {

    const psp = this.psprites[ 0 ];
    if ( ! psp.state ) return null;
    const st = STATES[ psp.state ];
    if ( ! st ) return null;
    return { sprite: st.sprite, frame: st.frame, bright: st.bright, sx: psp.sx, sy: psp.sy };

  }

  /** Get the muzzle flash sprite info for rendering */
  getFlashSprite(): { sprite: string; frame: number; bright: boolean; sx: Fixed; sy: Fixed } | null {

    const psp = this.psprites[ 1 ];
    if ( ! psp.state ) return null;
    const st = STATES[ psp.state ];
    if ( ! st ) return null;
    return { sprite: st.sprite, frame: st.frame, bright: st.bright, sx: psp.sx, sy: psp.sy };

  }

  // ============================================================
  // State machine internals
  // ============================================================

  private setPsprite( state: PlayerStatusState, layer: 0 | 1, stateName: string | null ): void {

    const psp = this.psprites[ layer ];

    // Walk through 0-tic states immediately
    while ( stateName ) {

      if ( stateName === 'NULL' || ! STATES[ stateName ] ) {

        psp.state = null;
        psp.tics = 0;
        return;

      }

      const st = STATES[ stateName ];
      psp.state = stateName;
      psp.tics = st.tics;

      // Execute action
      if ( st.action ) this.execAction( st.action, state, psp );

      // Actions may replace or remove this psprite (notably zero-tic refire).
      if(!psp.state||psp.tics!==0)return;
      stateName=STATES[psp.state].next;

    }

  }

  private movePsprites( state: PlayerStatusState ): void {

    for ( let i = 0; i < 2; i ++ ) {

      const psp = this.psprites[ i ];
      if ( ! psp.state ) continue;

      // Tics of -1 = no countdown
      if ( psp.tics !== - 1 ) {

        psp.tics --;
        if ( psp.tics <= 0 ) {

          const st = STATES[ psp.state ];
          if ( st ) this.setPsprite( state, i as 0 | 1, st.next );

        }

      }

    }

    // Flash layer tracks weapon layer position
    this.psprites[ 1 ].sx = this.psprites[ 0 ].sx;
    this.psprites[ 1 ].sy = this.psprites[ 0 ].sy;



  }

  private bringUpWeapon( state: PlayerStatusState ): void {

    const weapon = state.pendingWeapon ?? state.currentWeapon;
    state.pendingWeapon = null;
    state.currentWeapon = weapon;

    // Set ammo display
    const info = WEAPON_INFO[ weapon ];
    if ( info.ammo ) state.currentAmmo = info.ammo;

    const psp = this.psprites[ 0 ];
    psp.sy = WEAPONBOTTOM;

    this.setPsprite( state, 0, info.upState );

  }

  private checkAmmo( state: PlayerStatusState ): boolean {

    const info = WEAPON_INFO[ state.currentWeapon ];
    if ( ! info.ammo ) return true; // fist, chainsaw

    let ammoNeeded = 1;
    if ( state.currentWeapon === 'bfg' ) ammoNeeded = BFGCELLS;
    if ( state.currentWeapon === 'supershotgun' ) ammoNeeded = 2;

    if ( state.ammo[ info.ammo ] >= ammoNeeded ) return true;

    // Out of ammo — switch to best available weapon
    const priority: WeaponSlot[] = [
      'plasma', 'supershotgun', 'chaingun', 'shotgun',
      'pistol', 'chainsaw', 'fist'
    ];

    for ( const w of priority ) {

      if ( ! state.weapons[ w ] ) continue;
      const wi = WEAPON_INFO[ w ];
      if ( ! wi.ammo || state.ammo[ wi.ammo ] > 0 ) {

        state.pendingWeapon = w;
        break;

      }

    }

    // Start lowering current weapon
    this.setPsprite( state, 0, WEAPON_INFO[ state.currentWeapon ].downState );
    return false;

  }

  private fireWeapon( state: PlayerStatusState ): void {

    if ( ! this.checkAmmo( state ) ) return;

    setPlayerMobjState(state,'S_PLAY_ATK1',this.playerActor);
    const info = WEAPON_INFO[ state.currentWeapon ];
    this.setPsprite( state, 0, info.atkState );
    this.noiseCallback?.();

  }

  // ============================================================
  // Action functions — ported from p_pspr.c
  // ============================================================

  private execAction( name: string, state: PlayerStatusState, psp: PSpriteDef ): void {

    switch ( name ) {

      case 'A_WeaponReady': this.A_WeaponReady( state, psp ); break;
      case 'A_Lower':       this.A_Lower( state, psp ); break;
      case 'A_Raise':       this.A_Raise( state, psp ); break;
      case 'A_ReFire':      this.A_ReFire( state, psp ); break;
      case 'A_FirePistol':  this.A_FirePistol( state ); break;
      case 'A_FireShotgun': this.A_FireShotgun( state ); break;
      case 'A_FireShotgun2':this.A_FireShotgun2( state ); break;
      case 'A_FireCGun':    this.A_FireCGun( state ); break;
      case 'A_FireMissile': this.A_FireMissile( state ); break;
      case 'A_FirePlasma':  this.A_FirePlasma( state ); break;
      case 'A_FireBFG':     this.A_FireBFG( state ); break;
      case 'A_Punch':       this.A_Punch( state ); break;
      case 'A_Saw':         this.A_Saw( state ); break;
      case 'A_GunFlash':    this.A_GunFlash( state ); break;
      case 'A_Light0':      break; // extralight = 0 (lighting, not yet used)
      case 'A_Light1':      break; // extralight = 1
      case 'A_Light2':      break; // extralight = 2
      case 'A_BFGsound':    playSound( 'bfg' ); break;
      case 'A_CheckReload': this.checkAmmo( state ); break;
      case 'A_OpenShotgun2':  playSound( 'dbopn' ); break;
      case 'A_LoadShotgun2':  playSound( 'dbload' ); break;
      case 'A_CloseShotgun2': playSound( 'dbcls' ); this.A_ReFire( state, psp ); break;

    }

  }

  private A_WeaponReady( state: PlayerStatusState, psp: PSpriteDef ): void {

    if(state.mobjState.name==='S_PLAY_ATK1'||state.mobjState.name==='S_PLAY_ATK2')setPlayerMobjState(state,'S_PLAY',this.playerActor);
    if(state.currentWeapon==='chainsaw'&&psp.state==='SAW')playSound('sawidl');
    // Check for weapon change or death.
    if ( state.pendingWeapon !== null || !state.health ) {

      this.setPsprite( state, 0, WEAPON_INFO[ state.currentWeapon ].downState );
      return;

    }

    // Check for fire
    if(this.attackHeld){
      if(!this.attackDown||(state.currentWeapon!=='missile'&&state.currentWeapon!=='bfg')){
        this.attackDown=true;this.fireWeapon(state);return;
      }
    }else this.attackDown=false;

    this.applyBob(this.bob,this.levelTime);

  }

  private A_Lower( state: PlayerStatusState, psp: PSpriteDef ): void {

    psp.sy += LOWERSPEED;

    if ( psp.sy < WEAPONBOTTOM ) return;

    // Weapon is fully lowered — bring up new weapon
    if ( state.health <= 0 ) {

      // Dead — keep weapon down
      psp.sy = WEAPONBOTTOM;
      return;

    }

    this.bringUpWeapon( state );

  }

  private A_Raise( _state: PlayerStatusState, psp: PSpriteDef ): void {

    psp.sy -= RAISESPEED;

    if ( psp.sy > WEAPONTOP ) return;

    // Weapon is fully raised
    psp.sy = WEAPONTOP;
    const info = WEAPON_INFO[ _state.currentWeapon ];
    this.setPsprite( _state, 0, info.readyState );

  }

  private A_ReFire( state: PlayerStatusState, _psp: PSpriteDef ): void {

    if ( this.attackHeld && state.pendingWeapon===null && state.health > 0 ) {

      this.refire++;
      this.fireWeapon( state );

    } else {

      this.refire = 0;
      this.checkAmmo(state);

    }

  }

  private A_GunFlash( state: PlayerStatusState ): void {
    setPlayerMobjState(state,'S_PLAY_ATK2',this.playerActor);

    const info = WEAPON_INFO[ state.currentWeapon ];
    if ( info.flashState ) {

      this.setPsprite( state, 1, info.flashState );

    }

  }

  // --- Hitscan / projectile actions ---
  // Ported from p_pspr.c — hitscans now call lineAttack via fireCallback

  private fireHitscan( angle: number, damage: number, range = 2048 * FRACUNIT, slope = this.aimCallback?.(this.lastAngle, range) ?? 0 ): Mobj | null {

    return this.fireCallback?.( angle, slope, damage, range ) ?? null;

  }

  private A_FirePistol( state: PlayerStatusState ): void {

    playSound( 'pistol' );
    state.ammo.clip --;
    this.A_GunFlash( state );

    // P_BulletSlope is sampled once before any pellet changes the world.
    const slope = this.getBulletSlope();

    // Pistol: 5 * (1d3) damage, with ±5.625° spread
    const damage = 5 * ( ( P_Random() % 3 ) + 1 );
    const spread = this.refire ? ( P_Random() - P_Random() ) * ( 5.625 / 256 ) * ( Math.PI / 180 ) : 0;
    this.fireHitscan( this.lastAngle + spread, damage, 2048 * FRACUNIT, slope );

  }

  private A_FireShotgun( state: PlayerStatusState ): void {

    playSound( 'shotgn' );
    state.ammo.shell --;
    this.A_GunFlash( state );

    // P_BulletSlope is sampled once before any pellet changes the world.
    const slope = this.getBulletSlope();

    // Shotgun: 7 pellets, each 5 * (1d3) damage
    for ( let i = 0; i < 7; i ++ ) {

      const damage = 5 * ( ( P_Random() % 3 ) + 1 );
      const spread = ( P_Random() - P_Random() ) * ( 5.625 / 256 ) * ( Math.PI / 180 );
      this.fireHitscan( this.lastAngle + spread, damage, 2048 * FRACUNIT, slope );

    }

  }

  private A_FireShotgun2( state: PlayerStatusState ): void {

    playSound( 'dshtgn' );
    state.ammo.shell -= 2;
    this.A_GunFlash( state );

    // P_BulletSlope is sampled once before any pellet changes the world.
    const slope = this.getBulletSlope();

    // SSG: 20 pellets, each 5 * (1d3) damage, wider spread (±11.25°)
    for ( let i = 0; i < 20; i ++ ) {

      const damage = 5 * ( ( P_Random() % 3 ) + 1 );
      const spread = ( P_Random() - P_Random() ) * ( 11.25 / 256 ) * ( Math.PI / 180 );
      const verticalSpread = ( P_Random() - P_Random() ) << 5;
      this.fireHitscan( this.lastAngle + spread, damage, 2048 * FRACUNIT, slope + verticalSpread );

    }

  }

  private A_FireCGun( state: PlayerStatusState ): void {

    playSound( 'pistol' );
    if ( state.ammo.clip <= 0 ) return;
    state.ammo.clip --;

    setPlayerMobjState(state,'S_PLAY_ATK2',this.playerActor);
    // P_BulletSlope is sampled once before any pellet changes the world.
    const slope = this.getBulletSlope();

    // Alternate flash states
    const psp = this.psprites[ 0 ];
    const flashState = psp.state === 'CHAIN1' ? 'CHAINFLASH1' : 'CHAINFLASH2';
    this.setPsprite( state, 1, flashState );

    // Chaingun: same as pistol per bullet
    const damage = 5 * ( ( P_Random() % 3 ) + 1 );
    const spread = this.refire ? ( P_Random() - P_Random() ) * ( 5.625 / 256 ) * ( Math.PI / 180 ) : 0;
    this.fireHitscan( this.lastAngle + spread, damage, 2048 * FRACUNIT, slope );

  }

  private A_FireMissile( state: PlayerStatusState ): void {

    state.ammo.misl --;
    if ( this.missileCallback ) this.missileCallback( this.lastAngle, 'MT_ROCKET' );

  }

  private A_FirePlasma( state: PlayerStatusState ): void {

    state.ammo.cell --;
    // Randomize flash between the two plasma flash states
    const flashState = P_Random() < 128 ? 'PLASMAFLASH1' : 'PLASMAFLASH2';
    this.setPsprite( state, 1, flashState );
    if ( this.missileCallback ) this.missileCallback( this.lastAngle, 'MT_PLASMA' );

  }

  private A_FireBFG( state: PlayerStatusState ): void {

    state.ammo.cell -= BFGCELLS;
    if ( this.missileCallback ) this.missileCallback( this.lastAngle, 'MT_BFG' );

  }

  private A_Punch( state: PlayerStatusState ): void {

    // Berserk does 10x damage
    let damage = ( P_Random() % 10 + 1 ) * 2;
    if ( state.powers.strength ) damage *= 10;
    const angle=this.lastAngle+(P_Random()-P_Random())*(Math.PI*2/16384);
    const slope=this.aimCallback?.(angle,64*FRACUNIT)??0;
    const target=this.fireHitscan(angle,damage,64*FRACUNIT,slope);
    if(target){
      playSound('punch');
      if(this.playerActor)this.playerActor.angle=pointToRadians(target.x-this.playerActor.x,target.y-this.playerActor.y);
    }

  }

  private A_Saw( state: PlayerStatusState ): void {

    const damage = 2 * ( P_Random() % 10 + 1 );
    playSound( 'sawful' );
    this.fireHitscan( this.lastAngle, damage, 65 * FRACUNIT );

  }

  /** Apply weapon bob based on player movement — call each tic from ready state */
  applyBob( bob: Fixed, levelTime: number ): void {

    const psp = this.psprites[ 0 ];
    if ( ! psp.state ) return;

    const st = STATES[ psp.state ];
    if ( ! st || ( st.action !== 'A_WeaponReady' ) ) return;

    // From A_WeaponReady in p_pspr.c:
    // angle = (128 * leveltime) & FINEMASK;  (FINEMASK = 8191, FINEANGLES = 8192)
    // psp->sx = FRACUNIT + FixedMul(bob, finecosine[angle]);
    // psp->sy = WEAPONTOP + FixedMul(bob, finesine[angle & (FINEANGLES/2-1)]);
    // Wrap angle like original: (128 * leveltime) & FINEMASK (8191)
    const fine = ( 128 * levelTime ) & 8191;
    const halfFine = fine & 4095;
    // Bob is fixed-point from DoomPlayer.bob
    psp.sx = FRACUNIT + fixedMul( bob, finesine[fine+2048] );
    psp.sy = WEAPONTOP + fixedMul( bob, finesine[halfFine] );

  }

}
