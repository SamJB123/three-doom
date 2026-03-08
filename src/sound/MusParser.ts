// Parse Doom MUS format into a sequence of timed music events.
// Based on the MUS format spec: https://doomwiki.org/wiki/MUS
//
// MUS is a simplified MIDI-like format used by Doom.
// Events are encoded as compact byte sequences with variable-length delays.

import type { WAD } from '../wad/types';
import { getLump } from '../wad/WADParser';

// ============================================================
// MUS event types
// ============================================================

export const enum MusEventType {
  ReleaseNote = 0,
  PlayNote = 1,
  PitchBend = 2,
  SystemEvent = 3,
  Controller = 4,
  EndOfMeasure = 5,
  Finish = 6,
}

export interface MusEvent {
  type: MusEventType;
  channel: number;    // MUS channel 0-15 (15 = percussion → MIDI 9)
  delay: number;      // delay AFTER this event, in MUS ticks (140 ticks/sec)
  note?: number;      // 0-127
  volume?: number;    // 0-127, -1 = use last volume
  controller?: number; // MUS controller ID
  value?: number;     // controller/pitch value
}

export interface MusTrack {
  events: MusEvent[];
  ticksPerSecond: number; // MUS runs at 140 ticks/sec
}

// MUS controller → MIDI controller mapping
const MUS_TO_MIDI_CTRL: Record<number, number> = {
  0: -1,  // Instrument change (handled specially as program change)
  1: 0,   // Bank select
  2: 1,   // Modulation
  3: 7,   // Volume
  4: 10,  // Pan
  5: 11,  // Expression
  6: 91,  // Reverb
  7: 93,  // Chorus
  8: 64,  // Sustain pedal
  9: 67,  // Soft pedal
};

/**
 * Parse a MUS lump from the WAD into a MusTrack.
 */
export function parseMus( wad: WAD, lumpName: string ): MusTrack | null {

  const lump = getLump( wad, lumpName );
  if ( ! lump ) return null;

  const buf = wad.buf;
  const view = wad.view;
  const base = lump.offset;

  // Validate MUS signature: "MUS\x1A"
  if ( buf[ base ] !== 0x4D || buf[ base + 1 ] !== 0x55 ||
       buf[ base + 2 ] !== 0x53 || buf[ base + 3 ] !== 0x1A ) {

    return null;

  }

  // Header
  const lenSong = view.getUint16( base + 4, true );
  const offSong = view.getUint16( base + 6, true );

  const events: MusEvent[] = [];
  let offset = base + offSong;
  const endOffset = base + offSong + lenSong;

  // Per-channel last volume (MUS reuses last volume if not specified)
  const channelVolumes = new Uint8Array( 16 ).fill( 127 );

  while ( offset < endOffset ) {

    const eventByte = buf[ offset ++ ];
    const last = ( eventByte & 0x80 ) !== 0; // delay follows after this event
    const type = ( eventByte >> 4 ) & 0x07;
    const channel = eventByte & 0x0F;

    const event: MusEvent = {
      type: type as MusEventType,
      channel,
      delay: 0
    };

    switch ( type ) {

      case MusEventType.ReleaseNote: {

        const note = buf[ offset ++ ] & 0x7F;
        event.note = note;
        break;

      }

      case MusEventType.PlayNote: {

        const noteByte = buf[ offset ++ ];
        event.note = noteByte & 0x7F;

        if ( noteByte & 0x80 ) {

          // Volume byte follows
          const vol = buf[ offset ++ ] & 0x7F;
          channelVolumes[ channel ] = vol;
          event.volume = vol;

        } else {

          event.volume = channelVolumes[ channel ];

        }

        break;

      }

      case MusEventType.PitchBend: {

        event.value = buf[ offset ++ ];
        break;

      }

      case MusEventType.SystemEvent: {

        const ctrl = buf[ offset ++ ] & 0x7F;
        event.controller = ctrl;
        event.value = 0;
        break;

      }

      case MusEventType.Controller: {

        const ctrl = buf[ offset ++ ] & 0x7F;
        const val = buf[ offset ++ ] & 0x7F;
        event.controller = ctrl;
        event.value = val;

        if ( ctrl === 3 ) {

          channelVolumes[ channel ] = val;

        }

        break;

      }

      case MusEventType.Finish:
        events.push( event );
        return { events, ticksPerSecond: 140 };

      case MusEventType.EndOfMeasure:
      default:
        break;

    }

    // Read variable-length delay if "last" bit was set
    if ( last ) {

      let delay = 0;

      while ( true ) {

        const b = buf[ offset ++ ];
        delay = delay * 128 + ( b & 0x7F );

        if ( ( b & 0x80 ) === 0 ) break;

      }

      event.delay = delay;

    }

    events.push( event );

  }

  return { events, ticksPerSecond: 140 };

}
