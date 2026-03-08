// ============================================================
// Doom thing type (doomednum) to sprite prefix (4-letter code) mapping
//
// Derived from the original Doom source (linuxdoom-1.10/info.c):
//   mobjinfo[].doomednum -> mobjinfo[].spawnstate -> states[].sprite -> sprnames[]
//
// Entries with doomednum -1 (not placeable) are excluded.
// Player starts (types 1-4, 11, 14) are excluded (handled separately).
// ============================================================

/**
 * Maps Doom thing type numbers (doomednum) to their 4-letter sprite prefixes.
 */
export const THING_SPRITE_MAP: Record<number, string> = {
  // --- Keys ---
  5: 'BKEY',     // Blue keycard
  6: 'YKEY',     // Yellow keycard
  13: 'RKEY',    // Red keycard
  38: 'RSKU',    // Red skull key
  39: 'YSKU',    // Yellow skull key
  40: 'BSKU',    // Blue skull key

  // --- Enemies ---
  7: 'SPID',     // Spider Mastermind
  9: 'SPOS',     // Shotgun Guy
  16: 'CYBR',    // Cyberdemon
  58: 'SARG',    // Spectre (invisible Demon)
  64: 'VILE',    // Arch-Vile
  65: 'CPOS',    // Chaingunner
  66: 'SKEL',    // Revenant
  67: 'FATT',    // Mancubus
  68: 'BSPI',    // Arachnotron
  69: 'BOS2',    // Hell Knight
  71: 'PAIN',    // Pain Elemental
  72: 'KEEN',    // Commander Keen (hanging)
  84: 'SSWV',    // Wolfenstein SS
  3001: 'TROO',  // Imp
  3002: 'SARG',  // Demon (Pinky)
  3003: 'BOSS',  // Baron of Hell
  3004: 'POSS',  // Zombieman
  3005: 'HEAD',  // Cacodemon
  3006: 'SKUL',  // Lost Soul

  // --- Boss brain ---
  87: 'TROO',    // Boss target (spawn spot) - uses S_NULL -> SPR_TROO
  88: 'BBRN',    // Boss brain
  89: 'SSWV',    // Boss eye (shooter) - uses S_BRAINEYE -> SPR_SSWV

  // --- Weapons ---
  82: 'SGN2',    // Super Shotgun
  2001: 'SHOT',  // Shotgun
  2002: 'MGUN',  // Chaingun
  2003: 'LAUN',  // Rocket Launcher
  2004: 'PLAS',  // Plasma Rifle
  2005: 'CSAW',  // Chainsaw
  2006: 'BFUG',  // BFG9000

  // --- Ammo ---
  2007: 'CLIP',  // Clip (bullets)
  2008: 'SHEL',  // Shotgun shells
  2010: 'ROCK',  // Rocket
  2046: 'BROK',  // Box of rockets
  2047: 'CELL',  // Cell charge
  2048: 'AMMO',  // Box of bullets
  2049: 'SBOX',  // Box of shells
  17: 'CELP',    // Cell charge pack
  8: 'BPAK',     // Backpack

  // --- Health & Armor pickups ---
  2011: 'STIM',  // Stimpack
  2012: 'MEDI',  // Medikit
  2013: 'SOUL',  // Soulsphere
  2014: 'BON1',  // Health bonus
  2015: 'BON2',  // Armor bonus
  2018: 'ARM1',  // Green armor
  2019: 'ARM2',  // Blue armor
  83: 'MEGA',    // Megasphere

  // --- Powerups ---
  2022: 'PINV',  // Invulnerability
  2023: 'PSTR',  // Berserk
  2024: 'PINS',  // Partial invisibility
  2025: 'SUIT',  // Radiation suit
  2026: 'PMAP',  // Computer area map
  2045: 'PVIS',  // Light amplification visor

  // --- Obstacles / Decorations ---
  2028: 'COLU',  // Floor lamp
  2035: 'BAR1',  // Exploding barrel
  30: 'COL1',    // Tall green pillar
  31: 'COL2',    // Short green pillar
  32: 'COL3',    // Tall red pillar
  33: 'COL4',    // Short red pillar
  34: 'CAND',    // Candlestick
  35: 'CBRA',    // Candelabra
  36: 'COL5',    // Heart column
  37: 'COL6',    // Skull column
  41: 'CEYE',    // Evil eye
  42: 'FSKU',    // Floating skull
  43: 'TRE1',    // Burnt tree
  44: 'TBLU',    // Tall blue firestick
  45: 'TGRN',    // Tall green firestick
  46: 'TRED',    // Tall red firestick
  47: 'SMIT',    // Stalagmite
  48: 'ELEC',    // Tech pillar
  54: 'TRE2',    // Large brown tree
  55: 'SMBT',    // Short blue firestick
  56: 'SMGT',    // Short green firestick
  57: 'SMRT',    // Short red firestick
  70: 'FCAN',    // Burning barrel
  85: 'TLMP',    // Tall tech floor lamp
  86: 'TLP2',    // Short tech floor lamp

  // --- Gore decorations (hanging) ---
  49: 'GOR1',    // Hanging victim twitching (blocking)
  50: 'GOR2',    // Hanging victim arms out (blocking)
  51: 'GOR3',    // Hanging victim one-legged (blocking)
  52: 'GOR4',    // Hanging pair of legs (blocking)
  53: 'GOR5',    // Hanging leg (blocking)
  59: 'GOR2',    // Hanging victim arms out (non-blocking)
  60: 'GOR4',    // Hanging pair of legs (non-blocking)
  61: 'GOR3',    // Hanging victim one-legged (non-blocking)
  62: 'GOR5',    // Hanging leg (non-blocking)
  63: 'GOR1',    // Hanging victim twitching (non-blocking)
  73: 'HDB1',    // Hanging body, guts removed
  74: 'HDB2',    // Hanging body, brain removed
  75: 'HDB3',    // Hanging torso, looking down
  76: 'HDB4',    // Hanging torso, open skull
  77: 'HDB5',    // Hanging torso, looking up
  78: 'HDB6',    // Hanging torso, brain removed

  // --- Gore decorations (floor) ---
  10: 'PLAY',    // Bloody mess 1
  12: 'PLAY',    // Bloody mess 2
  15: 'PLAY',    // Dead player
  18: 'POSS',    // Dead Zombieman
  19: 'SPOS',    // Dead Shotgun Guy
  20: 'TROO',    // Dead Imp
  21: 'SARG',    // Dead Demon
  22: 'HEAD',    // Dead Cacodemon
  23: 'SKUL',    // Dead Lost Soul
  24: 'POL5',    // Pool of blood and flesh
  25: 'POL1',    // Impaled human (dead stick)
  26: 'POL6',    // Twitching impaled human
  27: 'POL4',    // Skull on a pole
  28: 'POL2',    // Five skulls shish kebab
  29: 'POL3',    // Pile of skulls and candles
  79: 'POB1',    // Pool of blood and bones
  80: 'POB2',    // Small pool of blood
  81: 'BRS1',    // Brain stem
};
