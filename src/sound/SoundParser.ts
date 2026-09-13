import {SOURCE_SOUNDS} from './SourceSounds';
// Parse Doom DMX sound lumps from WAD into Web Audio API AudioBuffers.
// DMX format: 8-byte header (uint16 format=3, uint16 sampleRate, uint32 numSamples)
// followed by unsigned 8-bit PCM data (128 = silence).
// Ported from i_sound.c

import type { WAD } from '../wad/types';
import { getLump } from '../wad/WADParser';

/**
 * Parse all known sound effects from the WAD into AudioBuffers.
 */
export async function parseSounds(
  wad: WAD,
  audioCtx: AudioContext
): Promise<Record<string, AudioBuffer>> {

  const buffers: Record<string, AudioBuffer> = {};

  for ( const [ name, info ] of Object.entries( SOURCE_SOUNDS ) ) {
    if(name==='none')continue;
    const lumpName='DS'+(info.link??name).toUpperCase();

    const lump = getLump( wad, lumpName );
    if ( ! lump ) continue;

    const buffer = parseDMXLump( wad, lump.offset, lump.size, audioCtx );
    if ( buffer ) buffers[ name ] = buffer;

  }

  return buffers;

}

function parseDMXLump(
  wad: WAD,
  offset: number,
  size: number,
  audioCtx: AudioContext
): AudioBuffer | null {

  if ( size < 8 ) return null;

  const view = wad.view;
  const format = view.getUint16( offset, true );
  const sampleRate = view.getUint16( offset + 2, true );
  const numSamples = view.getUint32( offset + 4, true );

  // Validate — format should be 3, sample rate typically 11025
  if ( format !== 3 ) return null;

  const dataLen = Math.min( numSamples, size - 8 );
  if ( dataLen <= 0 ) return null;

  // Create AudioBuffer and convert unsigned 8-bit PCM → float32 [-1, 1]
  const audioBuffer = audioCtx.createBuffer( 1, dataLen, sampleRate );
  const channel = audioBuffer.getChannelData( 0 );

  for ( let i = 0; i < dataLen; i ++ ) {

    // Unsigned 8-bit: 0..255, center=128 → float -1..1
    channel[ i ] = ( wad.buf[ offset + 8 + i ] - 128 ) / 128;

  }

  return audioBuffer;

}
