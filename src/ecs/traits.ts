import { trait } from 'koota';
import type { PerspectiveCamera, Group } from 'three/webgpu';
import type { DoomPlayer, DoomMapData } from '../physics/DoomMovement';

// World-level singletons
export const Time = trait( () => ( { delta: 0, elapsed: 0, levelTime: 0 } ) );
export const Input = trait( {
  forward: 0,
  strafe: 0,
  vertical: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  run: false,
  use: false,
  attack: false,
  weaponSelect: - 1  // -1 = no change, 0-8 = weapon slot
} );

interface DoomWorldState {
  player: DoomPlayer | null;
  map: DoomMapData | null;
}

interface CameraState {
  camera: PerspectiveCamera | null;
}

interface SceneRootState {
  group: Group | null;
}

// Doom movement data singleton (AoS — holds references)
export const DoomWorld = trait( (): DoomWorldState => ( {
  player: null,
  map: null
} ) );

// Camera singleton
export const Camera = trait( (): CameraState => ( {
  camera: null
} ) );

// Scene root
export const SceneRoot = trait( (): SceneRootState => ( {
  group: null
} ) );

// Player tag
export const IsPlayer = trait();

// Transform for entities
export const Position = trait( { x: 0, y: 0, z: 0 } );
export const Rotation = trait( { yaw: 0, pitch: 0 } );

// Ammo types
export type AmmoType = 'clip' | 'shell' | 'misl' | 'cell';
export const AMMO_TYPES: AmmoType[] = [ 'clip', 'shell', 'misl', 'cell' ];

// Weapon slots
export type WeaponSlot = 'fist' | 'pistol' | 'shotgun' | 'chaingun'
  | 'missile' | 'plasma' | 'bfg' | 'chainsaw' | 'supershotgun';
export const WEAPON_SLOTS: WeaponSlot[] = [
  'fist', 'pistol', 'shotgun', 'chaingun',
  'missile', 'plasma', 'bfg', 'chainsaw', 'supershotgun'
];

// Key card types
export type CardType = 'bluecard' | 'yellowcard' | 'redcard'
  | 'blueskull' | 'yellowskull' | 'redskull';
export const CARD_TYPES: CardType[] = [
  'bluecard', 'yellowcard', 'redcard',
  'blueskull', 'yellowskull', 'redskull'
];

// Power types
export type PowerType = 'invulnerability' | 'strength' | 'invisibility'
  | 'ironfeet' | 'allmap' | 'infrared';
export const POWER_TYPES: PowerType[] = [
  'invulnerability', 'strength', 'invisibility',
  'ironfeet', 'allmap', 'infrared'
];

// Power durations in Doom tics
export const POWER_DURATIONS: Record<PowerType, number> = {
  invulnerability: 1050,  // 30 seconds
  strength: 1,
  invisibility: 2100,     // 60 seconds
  ironfeet: 2100,         // 60 seconds
  allmap: 1,
  infrared: 4200          // 120 seconds
};

// Player lifecycle state (from d_player.h)
export type PlayerState = 'PST_LIVE' | 'PST_DEAD' | 'PST_REBORN';

// Player mobj state — drives actions (pain sound, death) via tic countdown
export interface PlayerMobjState {
  name: string;       // current state name (e.g. 'S_PLAY', 'S_PLAY_PAIN')
  tics: number;       // tics remaining (-1 = infinite)
}

// Player game state (health, armor, ammo, keys, weapons, powers)
export interface PlayerStatusState {
  health: number;
  armor: number;
  armorType: number;
  ammo: Record<AmmoType, number>;
  maxAmmo: Record<AmmoType, number>;
  didSecret: boolean;
  currentAmmo: AmmoType;
  currentWeapon: WeaponSlot;
  pendingWeapon: WeaponSlot | null;    // null = no change pending
  weapons: Record<WeaponSlot, boolean>;
  cards: Record<CardType, boolean>;
  powers: Record<PowerType, number>;   // remaining tics (0 = inactive)
  bonusCount: number;                  // item pickup glow counter
  damageCount: number;                 // damage red tint counter
  playerState: PlayerState;            // lifecycle: live, dead, reborn
  mobjState: PlayerMobjState;          // mobj state machine (pain, death, etc.)
  godMode: boolean;                    // IDDQD
  noClip: boolean;                     // IDCLIP / IDSPISPOPD
}

export const createPlayerStatus = (): PlayerStatusState => ( {
  health: 100,
  armor: 0,
  armorType: 0,
  didSecret: false,
  ammo: { clip: 50, shell: 0, misl: 0, cell: 0 },
  maxAmmo: { clip: 200, shell: 50, misl: 50, cell: 300 },
  currentAmmo: 'clip',
  currentWeapon: 'pistol' as WeaponSlot,
  pendingWeapon: null as WeaponSlot | null,
  weapons: {
    fist: true, pistol: true, shotgun: false, chaingun: false,
    missile: false, plasma: false, bfg: false, chainsaw: false,
    supershotgun: false
  },
  cards: {
    bluecard: false, yellowcard: false, redcard: false,
    blueskull: false, yellowskull: false, redskull: false
  },
  powers: {
    invulnerability: 0, strength: 0, invisibility: 0,
    ironfeet: 0, allmap: 0, infrared: 0
  },
  bonusCount: 0,
  damageCount: 0,
  playerState: 'PST_LIVE' as PlayerState,
  mobjState: { name: 'S_PLAY', tics: - 1 } as PlayerMobjState,
  godMode: false,
  noClip: false
} );
export const PlayerStatus = trait(createPlayerStatus);
