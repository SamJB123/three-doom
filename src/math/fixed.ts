// Fixed-point arithmetic — matches Doom's 16.16 fixed-point system.
// All position, velocity, and distance values use this format internally.
// Convert to float only at the Three.js rendering boundary.

export type Fixed = number; // 16.16 fixed-point stored as JS integer

export const FRACBITS = 16;
export const FRACUNIT = 1 << FRACBITS; // 65536

/** Multiply two fixed-point values: (a * b) >> 16 */
export function fixedMul( a: Fixed, b: Fixed ): Fixed {
  // Split into signed high/unsigned low halves: exact 64-bit product >> 16
  // modulo 32 bits, without losing precision in a JS double product.
  return (Math.imul(a >> 16, b) + Math.imul(a & 0xffff, b >> 16)
    + Math.floor((a & 0xffff) * (b & 0xffff) / FRACUNIT)) | 0;
}

/** Divide two fixed-point values: (a << 16) / b */
export function fixedDiv( a: Fixed, b: Fixed ): Fixed {
  // Check for overflow: if |a| >> 14 > |b|, result would overflow 32-bit
  if ( Math.floor( Math.abs( a ) / 16384 ) >= Math.abs( b ) ) {
    return a < 0 !== b < 0 ? - 0x80000000 : 0x7FFFFFFF;
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
