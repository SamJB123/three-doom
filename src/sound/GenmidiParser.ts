// Parse the GENMIDI lump from the WAD.
// GENMIDI contains OPL2 FM synthesis instrument definitions:
// 128 GM instruments + 47 percussion = 175 entries.
//
// Format:
//   8 bytes: "#OPL_II#" header
//   175 × 36 bytes: instrument records
//   175 × 32 bytes: instrument names (unused)

import type { WAD } from '../wad/types';
import { getLump } from '../wad/WADParser';

// OPL2 frequency multiplier lookup (register bits 3-0)
const FREQ_MULT: number[] = [
  0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15
];

export interface OplVoice {
  // Modulator
  modMultiplier: number;  // frequency multiplier
  modAttack: number;      // 0-15 (15 = fastest)
  modDecay: number;       // 0-15
  modSustain: number;     // 0-15 (0 = loudest)
  modRelease: number;     // 0-15
  modWaveform: number;    // 0-3
  modLevel: number;       // 0-63 (0 = loudest / most modulation)
  modTremolo: boolean;
  modVibrato: boolean;
  modSustainHold: boolean;
  modKsr: boolean;
  feedback: number;       // 0-7
  additive: boolean;      // connection bit: false=FM (mod→car), true=additive (mod+car)

  // Carrier
  carMultiplier: number;
  carAttack: number;
  carDecay: number;
  carSustain: number;
  carRelease: number;
  carWaveform: number;
  carLevel: number;       // 0-63 (0 = loudest)
  carTremolo: boolean;
  carVibrato: boolean;
  carSustainHold: boolean;
  carKsr: boolean;

  // Tuning
  noteOffset: number;     // semitone offset (int16)
}

export interface GenmidiInstrument {
  fixedPitch: boolean;
  doubleVoice: boolean;
  fineTuning: number;     // 128 = no detuning
  fixedNote: number;      // note number for fixed-pitch instruments
  voice1: OplVoice;
  voice2: OplVoice;
}

export type Genmidi = GenmidiInstrument[];

export function parseGenmidi( wad: WAD ): Genmidi | null {

  const lump = getLump( wad, 'GENMIDI' );
  if ( ! lump ) return null;

  const buf = wad.buf;
  const view = wad.view;
  const base = lump.offset;

  // Validate header: "#OPL_II#"
  const header = String.fromCharCode(
    buf[ base ], buf[ base + 1 ], buf[ base + 2 ], buf[ base + 3 ],
    buf[ base + 4 ], buf[ base + 5 ], buf[ base + 6 ], buf[ base + 7 ]
  );

  if ( header !== '#OPL_II#' ) return null;

  const instruments: GenmidiInstrument[] = [];

  for ( let i = 0; i < 175; i ++ ) {

    const off = base + 8 + i * 36;

    const flags = view.getUint16( off, true );
    const fineTuning = buf[ off + 2 ];
    const fixedNote = buf[ off + 3 ];

    const voice1 = parseVoice( buf, view, off + 4 );
    const voice2 = parseVoice( buf, view, off + 20 );

    instruments.push( {
      fixedPitch: ( flags & 0x0001 ) !== 0,
      doubleVoice: ( flags & 0x0004 ) !== 0,
      fineTuning,
      fixedNote,
      voice1,
      voice2
    } );

  }

  return instruments;

}

// GENMIDI voice data is SEQUENTIAL per Chocolate Doom:
//   6 bytes modulator, 1 byte feedback, 6 bytes carrier, 1 byte pad, 2 bytes note offset
// Layout per voice (16 bytes):
//   off+0:  Mod TVSKM  (Tremolo/Vibrato/Sustain/KSR/Multiplier) [reg 0x20]
//   off+1:  Mod AD     (Attack/Decay) [reg 0x60]
//   off+2:  Mod SR     (Sustain/Release) [reg 0x80]
//   off+3:  Mod WS     (Waveform) [reg 0xE0]
//   off+4:  Mod KSL    (Key Scale Level) [reg 0x40 bits 7-6]
//   off+5:  Mod Level  (Output Level) [reg 0x40 bits 5-0]
//   off+6:  FB/C       (Feedback bits 3-1, Connection bit 0) [reg 0xC0]
//   off+7:  Car TVSKM  [reg 0x20]
//   off+8:  Car AD     [reg 0x60]
//   off+9:  Car SR     [reg 0x80]
//   off+10: Car WS     [reg 0xE0]
//   off+11: Car KSL    [reg 0x40 bits 7-6]
//   off+12: Car Level  [reg 0x40 bits 5-0]
//   off+13: padding
//   off+14: Note offset (int16, little-endian)
function parseVoice( buf: Uint8Array, view: DataView, off: number ): OplVoice {

  const modTvskm = buf[ off + 0 ];
  const modAD    = buf[ off + 1 ];
  const modSR    = buf[ off + 2 ];
  const modWave  = buf[ off + 3 ];
  const _modKsl  = buf[ off + 4 ];
  const modOut   = buf[ off + 5 ];
  const fbConn   = buf[ off + 6 ];

  const carTvskm = buf[ off + 7 ];
  const carAD    = buf[ off + 8 ];
  const carSR    = buf[ off + 9 ];
  const carWave  = buf[ off + 10 ];
  const _carKsl  = buf[ off + 11 ];
  const carOut   = buf[ off + 12 ];

  const noteOffset = view.getInt16( off + 14, true );

  return {
    modMultiplier: FREQ_MULT[ modTvskm & 0x0F ],
    modAttack: ( modAD >> 4 ) & 0x0F,
    modDecay: modAD & 0x0F,
    modSustain: ( modSR >> 4 ) & 0x0F,
    modRelease: modSR & 0x0F,
    modWaveform: modWave & 0x03,
    modLevel: modOut & 0x3F,
    modTremolo: ( modTvskm & 0x80 ) !== 0,
    modVibrato: ( modTvskm & 0x40 ) !== 0,
    modSustainHold: ( modTvskm & 0x20 ) !== 0,
    modKsr: ( modTvskm & 0x10 ) !== 0,
    feedback: ( fbConn >> 1 ) & 0x07,
    additive: ( fbConn & 0x01 ) !== 0,

    carMultiplier: FREQ_MULT[ carTvskm & 0x0F ],
    carAttack: ( carAD >> 4 ) & 0x0F,
    carDecay: carAD & 0x0F,
    carSustain: ( carSR >> 4 ) & 0x0F,
    carRelease: carSR & 0x0F,
    carWaveform: carWave & 0x03,
    carLevel: carOut & 0x3F,
    carTremolo: ( carTvskm & 0x80 ) !== 0,
    carVibrato: ( carTvskm & 0x40 ) !== 0,
    carSustainHold: ( carTvskm & 0x20 ) !== 0,
    carKsr: ( carTvskm & 0x10 ) !== 0,

    noteOffset
  };

}

// Convert OPL2 rate (0-15) to time in seconds
// Rate 0 = no change (infinite), 15 = nearly instant
// These are approximate values matching OPL2 behavior
export function oplRateToTime( rate: number ): number {

  if ( rate === 0 ) return 10; // effectively infinite

  // OPL2 rates are roughly exponential
  // Each step halves the time
  return 6.0 / Math.pow( 2, rate - 1 );

}

// Convert OPL2 sustain level (0-15) to linear gain
// 0 = full volume, each step ≈ -3dB
export function oplSustainToGain( level: number ): number {

  if ( level >= 15 ) return 0;
  return Math.pow( 10, - level * 3 / 20 );

}

// Convert OPL2 output level (0-63) to linear gain
// 0 = full volume, each step ≈ -0.75dB
export function oplOutputToGain( level: number ): number {

  if ( level >= 63 ) return 0;
  return Math.pow( 10, - level * 0.75 / 20 );

}
