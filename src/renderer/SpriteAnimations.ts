// Sprite animation sequences from Doom's info.c state tables.
// Each entry maps a 4-letter sprite prefix to its looping frame sequence.
// Tics are in Doom tics (1/35 second).

export interface SpriteAnim {
  frames: string[];   // frame letters: 'A', 'B', 'C', ...
  tics: number[];     // duration of each frame in Doom tics
}

export const SPRITE_ANIMS: Record<string, SpriteAnim> = {

  // --- Pickups ---
  BON1: { frames: [ 'A', 'B', 'C', 'D', 'C', 'B' ], tics: [ 6, 6, 6, 6, 6, 6 ] },
  BON2: { frames: [ 'A', 'B', 'C', 'D', 'C', 'B' ], tics: [ 6, 6, 6, 6, 6, 6 ] },
  SOUL: { frames: [ 'A', 'B', 'C', 'D', 'C', 'B' ], tics: [ 6, 6, 6, 6, 6, 6 ] },
  PINS: { frames: [ 'A', 'B', 'C', 'D' ], tics: [ 6, 6, 6, 6 ] },
  PINV: { frames: [ 'A', 'B', 'C', 'D' ], tics: [ 6, 6, 6, 6 ] },
  MEGA: { frames: [ 'A', 'B', 'C', 'D' ], tics: [ 6, 6, 6, 6 ] },
  ARM1: { frames: [ 'A', 'B' ], tics: [ 6, 7 ] },
  ARM2: { frames: [ 'A', 'B' ], tics: [ 6, 6 ] },

  // --- Keys ---
  BKEY: { frames: [ 'A', 'B' ], tics: [ 10, 10 ] },
  YKEY: { frames: [ 'A', 'B' ], tics: [ 10, 10 ] },
  RKEY: { frames: [ 'A', 'B' ], tics: [ 10, 10 ] },
  BSKU: { frames: [ 'A', 'B' ], tics: [ 10, 10 ] },
  YSKU: { frames: [ 'A', 'B' ], tics: [ 10, 10 ] },
  RSKU: { frames: [ 'A', 'B' ], tics: [ 10, 10 ] },

  // --- Decorations ---
  BAR1: { frames: [ 'A', 'B' ], tics: [ 6, 6 ] },
  CEYE: { frames: [ 'A', 'B', 'C', 'B' ], tics: [ 6, 6, 6, 6 ] },
  FSKU: { frames: [ 'A', 'B', 'C' ], tics: [ 6, 6, 6 ] },
  FCAN: { frames: [ 'A', 'B', 'C' ], tics: [ 4, 4, 4 ] },
  POL6: { frames: [ 'A', 'B' ], tics: [ 6, 8 ] },
  GOR1: { frames: [ 'A', 'B', 'C', 'B' ], tics: [ 10, 15, 8, 6 ] },

  // --- Firesticks ---
  TBLU: { frames: [ 'A', 'B', 'C', 'D' ], tics: [ 4, 4, 4, 4 ] },
  TGRN: { frames: [ 'A', 'B', 'C', 'D' ], tics: [ 4, 4, 4, 4 ] },
  TRED: { frames: [ 'A', 'B', 'C', 'D' ], tics: [ 4, 4, 4, 4 ] },
  SMBT: { frames: [ 'A', 'B', 'C', 'D' ], tics: [ 4, 4, 4, 4 ] },
  SMGT: { frames: [ 'A', 'B', 'C', 'D' ], tics: [ 4, 4, 4, 4 ] },
  SMRT: { frames: [ 'A', 'B', 'C', 'D' ], tics: [ 4, 4, 4, 4 ] },

  // --- Tech lamps ---
  TLMP: { frames: [ 'A', 'B', 'C', 'D' ], tics: [ 4, 4, 4, 4 ] },
  TLP2: { frames: [ 'A', 'B', 'C', 'D' ], tics: [ 4, 4, 4, 4 ] },

};
