// Fixed-point arithmetic — matches Doom's 16.16 fixed-point system.
// All position, velocity, and distance values use this format internally.
// Convert to float only at the Three.js rendering boundary.

export type Fixed = number; // 16.16 fixed-point stored as JS integer

export const FRACBITS = 16;
export const FRACUNIT = 1 << FRACBITS; // 65536

/** Multiply two fixed-point values: (a * b) >> 16 */
export function fixedMul( a: Fixed, b: Fixed ): Fixed {
  return ( a * b / FRACUNIT ) | 0;
}

/** Divide two fixed-point values: (a << 16) / b */
export function fixedDiv( a: Fixed, b: Fixed ): Fixed {
  if ( Math.abs( b ) === 0 ) return 0;
  // Check for overflow: if |a| >> 14 > |b|, result would overflow 32-bit
  if ( ( Math.abs( a ) >> 14 ) >= Math.abs( b ) ) {
    return a < 0 !== b < 0 ? - 0x7FFFFFFF : 0x7FFFFFFF;
  }
  return ( ( a * FRACUNIT ) / b ) | 0;
}

/** Convert integer to fixed-point */
export function intToFixed( n: number ): Fixed {
  return ( n * FRACUNIT ) | 0;
}

/** Convert fixed-point to float (for rendering) */
export function fixedToFloat( f: Fixed ): number {
  return f / FRACUNIT;
}

/** Convert float to fixed-point */
export function floatToFixed( n: number ): Fixed {
  return ( n * FRACUNIT ) | 0;
}
