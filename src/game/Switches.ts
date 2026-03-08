// Doom switch texture pairs — when a switch is activated, its texture changes.
// Ported from p_switch.c

// Switch pairs: SW1* → SW2* (off → on)
const SWITCH_PAIRS: [string, string][] = [
  // Doom shareware / episode 1
  [ 'SW1BRCOM', 'SW2BRCOM' ],
  [ 'SW1BRN1', 'SW2BRN1' ],
  [ 'SW1BRN2', 'SW2BRN2' ],
  [ 'SW1BRNGN', 'SW2BRNGN' ],
  [ 'SW1BROWN', 'SW2BROWN' ],
  [ 'SW1COMM', 'SW2COMM' ],
  [ 'SW1COMP', 'SW2COMP' ],
  [ 'SW1DIRT', 'SW2DIRT' ],
  [ 'SW1EXIT', 'SW2EXIT' ],
  [ 'SW1GRAY', 'SW2GRAY' ],
  [ 'SW1GRAY1', 'SW2GRAY1' ],
  [ 'SW1METAL', 'SW2METAL' ],
  [ 'SW1PIPE', 'SW2PIPE' ],
  [ 'SW1SLAD', 'SW2SLAD' ],
  [ 'SW1STARG', 'SW2STARG' ],
  [ 'SW1STON1', 'SW2STON1' ],
  [ 'SW1STON2', 'SW2STON2' ],
  [ 'SW1STONE', 'SW2STONE' ],
  [ 'SW1STRTN', 'SW2STRTN' ],
  // Doom registered episodes 2 & 3
  [ 'SW1BLUE', 'SW2BLUE' ],
  [ 'SW1CMT', 'SW2CMT' ],
  [ 'SW1GARG', 'SW2GARG' ],
  [ 'SW1GSTON', 'SW2GSTON' ],
  [ 'SW1HOT', 'SW2HOT' ],
  [ 'SW1LION', 'SW2LION' ],
  [ 'SW1SATYR', 'SW2SATYR' ],
  [ 'SW1SKIN', 'SW2SKIN' ],
  [ 'SW1VINE', 'SW2VINE' ],
  [ 'SW1WOOD', 'SW2WOOD' ],
];

// Build lookup: texture name → its partner
const switchLookup = new Map<string, string>();

for ( const [ a, b ] of SWITCH_PAIRS ) {

  switchLookup.set( a, b );
  switchLookup.set( b, a );

}

// Find the partner texture for a switch (SW1* ↔ SW2*)
export function getSwitchPartner( texName: string ): string | null {

  return switchLookup.get( texName ) ?? null;

}

// Check if a texture name is a switch
export function isSwitchTexture( texName: string ): boolean {

  return switchLookup.has( texName );

}
