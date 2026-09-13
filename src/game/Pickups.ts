import {PICKUP_MESSAGES} from './PickupMessages';
import { allMobjs, removeMobj, type Mobj } from './Mobj';
import { MF_SPECIAL, MF_DROPPED, MF_SHADOW } from './MobjData';
import { removeStaticSprite } from '../renderer/SpriteRenderer';
// Item pickup system — ported from p_inter.c P_TouchSpecialThing().
// Checks player proximity to items each tic and applies pickup effects.

import type { Group, Mesh } from 'three/webgpu';
import type { World } from 'koota';
import type { AmmoType, WeaponSlot, CardType, PowerType, PlayerStatusState } from '../ecs/traits';
import { PlayerStatus, AMMO_TYPES, POWER_DURATIONS } from '../ecs/traits';
import { gameRules } from './GameRules';
import { playSound } from '../sound';
import type { Fixed } from '../math/fixed';
import { FRACBITS, intToFixed } from '../math/fixed';

export const COUNTED_ITEMS = new Set([2013,2014,2015,2022,2023,2024,2025,2026,2045,83]);
let messageCallback: ((text:string)=>void)|null=null;
export function setPickupMessageCallback(callback:(text:string)=>void):void {messageCallback=callback;}
let pickupCallback: ((type: number) => void) | null = null;
export function setPickupCallback(cb: (type: number) => void): void { pickupCallback = cb; }

const BONUSADD = 6; // tics of bonus glow per pickup

// Base units per clip for each ammo type (from p_inter.c clipammo[])
const CLIP_AMMO: Record<AmmoType, number> = { clip: 10, shell: 4, misl: 1, cell: 20 };

// Pickup radius: player (16) + item (20) = 36 Doom units (fixed-point)
const PICKUP_DIST = 36 << FRACBITS;

interface PickupDef {
  type: 'health' | 'armor' | 'ammo' | 'weapon' | 'key' | 'powerup';
  alwaysCollect?: boolean;
  healthAmount?: number;
  healthMax?: number;
  armorAmount?: number;
  armorType?: number;
  ammo?: AmmoType;
  ammoClips?: number;
  backpack?: boolean;
  weapon?: WeaponSlot;
  weaponAmmo?: AmmoType;
  weaponAmmoClips?: number;
  card?: CardType;
  power?: PowerType;
  sound?: string;
}

// Map DoomEd thing type → pickup definition
const PICKUP_DEFS: Record<number, PickupDef> = {

  // --- Health ---
  2014: { type: 'health', alwaysCollect:true, healthAmount: 1, healthMax: 200, sound: 'itemup' },
  2011: { type: 'health', healthAmount: 10, healthMax: 100, sound: 'itemup' },
  2012: { type: 'health', healthAmount: 25, healthMax: 100, sound: 'itemup' },
  2013: { type: 'health', alwaysCollect:true, healthAmount: 100, healthMax: 200, sound: 'getpow' },

  // --- Armor ---
  2015: { type: 'armor', armorAmount: 1, armorType: 0, sound: 'itemup' },
  2018: { type: 'armor', armorAmount: 100, armorType: 1, sound: 'itemup' },
  2019: { type: 'armor', armorAmount: 200, armorType: 2, sound: 'itemup' },

  // --- Megasphere ---
  83: { type: 'powerup', healthAmount: 200, healthMax: 200, armorAmount: 200, armorType: 2, sound: 'getpow' },

  // --- Ammo ---
  2007: { type: 'ammo', ammo: 'clip', ammoClips: 1, sound: 'itemup' },
  2048: { type: 'ammo', ammo: 'clip', ammoClips: 5, sound: 'itemup' },
  2008: { type: 'ammo', ammo: 'shell', ammoClips: 1, sound: 'itemup' },
  2049: { type: 'ammo', ammo: 'shell', ammoClips: 5, sound: 'itemup' },
  2010: { type: 'ammo', ammo: 'misl', ammoClips: 1, sound: 'itemup' },
  2046: { type: 'ammo', ammo: 'misl', ammoClips: 5, sound: 'itemup' },
  2047: { type: 'ammo', ammo: 'cell', ammoClips: 1, sound: 'itemup' },
  17:   { type: 'ammo', ammo: 'cell', ammoClips: 5, sound: 'itemup' },
  8:    { type: 'ammo', backpack: true, sound: 'itemup' },

  // --- Weapons ---
  2001: { type: 'weapon', weapon: 'shotgun', weaponAmmo: 'shell', weaponAmmoClips: 2, sound: 'wpnup' },
  82:   { type: 'weapon', weapon: 'supershotgun', weaponAmmo: 'shell', weaponAmmoClips: 2, sound: 'wpnup' },
  2002: { type: 'weapon', weapon: 'chaingun', weaponAmmo: 'clip', weaponAmmoClips: 2, sound: 'wpnup' },
  2003: { type: 'weapon', weapon: 'missile', weaponAmmo: 'misl', weaponAmmoClips: 2, sound: 'wpnup' },
  2004: { type: 'weapon', weapon: 'plasma', weaponAmmo: 'cell', weaponAmmoClips: 2, sound: 'wpnup' },
  2005: { type: 'weapon', weapon: 'chainsaw', sound: 'wpnup' },
  2006: { type: 'weapon', weapon: 'bfg', weaponAmmo: 'cell', weaponAmmoClips: 2, sound: 'wpnup' },

  // --- Keys ---
  5:  { type: 'key', card: 'bluecard', sound: 'itemup' },
  6:  { type: 'key', card: 'yellowcard', sound: 'itemup' },
  13: { type: 'key', card: 'redcard', sound: 'itemup' },
  40: { type: 'key', card: 'blueskull', sound: 'itemup' },
  39: { type: 'key', card: 'yellowskull', sound: 'itemup' },
  38: { type: 'key', card: 'redskull', sound: 'itemup' },

  // --- Powerups ---
  2022: { type: 'powerup', power: 'invulnerability', sound: 'getpow' },
  2023: { type: 'powerup', power: 'strength', healthAmount: 100, healthMax: 100, sound: 'getpow' },
  2024: { type: 'powerup', power: 'invisibility', sound: 'getpow' },
  2025: { type: 'powerup', power: 'ironfeet', sound: 'getpow' },
  2026: { type: 'powerup', power: 'allmap', sound: 'getpow' },
  2045: { type: 'powerup', power: 'infrared', sound: 'getpow' },
};

function giveAmmo( state: PlayerStatusState, ammo: AmmoType, clips: number ): boolean {

  if ( state.ammo[ ammo ] >= state.maxAmmo[ ammo ] ) return false;

  const oldAmmo = state.ammo[ammo];
  state.ammo[ ammo ] = Math.min(
    state.maxAmmo[ ammo ],
    state.ammo[ ammo ] + CLIP_AMMO[ ammo ] * clips * (gameRules.skill === 1 || gameRules.skill === 5 ? 2 : 1)
  );

  // P_GiveAmmo only raises a weapon when replenishing an empty ammo pool.
  if (oldAmmo === 0) {
    const ready = state.currentWeapon;
    if (ammo === 'clip' && ready === 'fist') state.pendingWeapon = state.weapons.chaingun ? 'chaingun' : 'pistol';
    if (ammo === 'shell' && (ready === 'fist' || ready === 'pistol') && state.weapons.shotgun) state.pendingWeapon = 'shotgun';
    if (ammo === 'cell' && (ready === 'fist' || ready === 'pistol') && state.weapons.plasma) state.pendingWeapon = 'plasma';
    if (ammo === 'misl' && ready === 'fist' && state.weapons.missile) state.pendingWeapon = 'missile';
  }
  return true;

}

function tryPickup( def: PickupDef, state: PlayerStatusState ): boolean {

  switch ( def.type ) {

    case 'health': {

      if ( !def.alwaysCollect && state.health >= ( def.healthMax ?? 100 ) ) return false;
      state.health = Math.min( def.healthMax ?? 100, state.health + ( def.healthAmount ?? 0 ) );
      return true;

    }

    case 'armor': {

      if ( def.armorType === 0 ) {

        state.armor = Math.min( 200, state.armor + ( def.armorAmount ?? 1 ) );
        if ( state.armorType === 0 ) state.armorType = 1;
        return true;

      }

      const newArmor = def.armorAmount ?? 100;
      if ( state.armor >= newArmor ) return false;
      state.armor = newArmor;
      state.armorType = def.armorType ?? 1;
      return true;

    }

    case 'ammo': {

      if ( def.backpack ) {

        let gave = false;
        state.maxAmmo = { clip: 400, shell: 100, misl: 100, cell: 600 };

        for ( const at of AMMO_TYPES ) {

          if ( giveAmmo( state, at, 1 ) ) gave = true;

        }

        return gave || true;

      }

      return giveAmmo( state, def.ammo!, def.ammoClips ?? 1 );

    }

    case 'weapon': {

      let gave = false;

      if ( def.weaponAmmo ) {

        gave = giveAmmo( state, def.weaponAmmo, def.weaponAmmoClips ?? 2 );

      }

      if ( ! state.weapons[ def.weapon! ] ) {

        state.weapons[ def.weapon! ] = true;
        state.pendingWeapon = def.weapon!;
        gave = true;

      }

      return gave;

    }

    case 'key': {

      if (!state.cards[def.card!]) state.bonusCount = BONUSADD;
      state.cards[ def.card! ] = true;
      return true;

    }

    case 'powerup': {

      if ( def.power ) {

        const pw = def.power;
        if ( pw !== 'strength' && pw !== 'ironfeet'
          && pw !== 'invulnerability' && pw !== 'invisibility'
          && pw !== 'infrared' && state.powers[ pw ] ) return false;

        state.powers[ pw ] = POWER_DURATIONS[ pw ];

      }

      if ( def.healthAmount ) {

        // P_GivePower(strength) uses P_GiveBody: never reduce surplus health.
        state.health = def.power === 'strength' ? Math.max(state.health, 100) : def.healthAmount;
        if (def.power === 'strength' && state.currentWeapon !== 'fist') state.pendingWeapon = 'fist';

      }

      if ( def.armorAmount ) {

        state.armor = def.armorAmount;
        state.armorType = def.armorType ?? 2;

      }

      return true;

    }

    default:
      return false;

  }

}

/**
 * Check for item pickups each simulation tic.
 * playerX/playerY are fixed-point Doom coordinates.
 */
export function checkPickups(
  world: World,
  spriteGroup: Group,
  playerX: Fixed,
  playerY: Fixed,
  playerZ: Fixed,
  player?: Mobj
): void {

  const state = world.get( PlayerStatus );
  if ( ! state || state.health <= 0 ) return;

  // P_TouchSpecialThing: dropped items use the same pickup rules as map
  // items, with a half clip or one weapon-ammo clip when MF_DROPPED is set.
  for (const item of [...allMobjs]) {
    if (item.removed || !(item.flags & MF_SPECIAL)) continue;
    const def = PICKUP_DEFS[item.info.doomedNum];
    if (!def) continue;
    const dz = item.z-playerZ;
    if (dz>56*65536 || dz< -8*65536) continue;
    if (Math.abs(playerX-item.x)>=PICKUP_DIST || Math.abs(playerY-item.y)>=PICKUP_DIST) continue;
    const pickup = item.flags & MF_DROPPED
      ? {...def, ammoClips:def.type==='ammo' ? 0.5 : def.ammoClips, weaponAmmoClips:1} : def;
    const notify = def.type !== 'key' || !state.cards[def.card!];
    if (tryPickup(pickup,state)) {
      if(player&&def.power==='invisibility')player.flags|=MF_SHADOW;
      pickupCallback?.(item.info.doomedNum);
      if (notify) messageCallback?.(PICKUP_MESSAGES[item.info.doomedNum]);
      state.bonusCount += BONUSADD;
      playSound(def.sound ?? 'itemup');
      removeMobj(item);
    }
  }

  const toRemove: Mesh[] = [];

  for ( const child of spriteGroup.children ) {

    const mesh = child as Mesh;
    const thingType = mesh.userData.thingType as number | undefined;
    if ( thingType === undefined ) continue;

    const def = PICKUP_DEFS[ thingType ];
    if ( ! def ) continue;

    // Thing positions are integers from WAD — convert to fixed-point for comparison
    const tx = intToFixed( mesh.userData.thingX as number );
    const ty = intToFixed( mesh.userData.thingY as number );

    const sector=mesh.userData.sector;
    const itemZ=sector ? intToFixed(sector.floorHeight) : (mesh.userData.mobj?.z ?? 0);
    const dz=itemZ-playerZ;
    if(dz>56*65536 || dz< -8*65536) continue;
    if ( Math.abs( playerX - tx ) >= PICKUP_DIST ) continue;
    if ( Math.abs( playerY - ty ) >= PICKUP_DIST ) continue;

    const notify = def.type !== 'key' || !state.cards[def.card!];
    if ( tryPickup( def, state ) ) {
      // P_GivePower changes the actor before later thinkers can aim at it.
      if(player&&def.power==='invisibility')player.flags|=MF_SHADOW;

      pickupCallback?.(thingType);
      if (notify) messageCallback?.(PICKUP_MESSAGES[thingType]);
      state.bonusCount += BONUSADD;
      playSound( def.sound ?? 'itemup' );
      toRemove.push( mesh );

    }

  }

  for ( const mesh of toRemove ) {

    removeStaticSprite(mesh);

  }

}
