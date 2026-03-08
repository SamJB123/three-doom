// Parse Doom DMX sound lumps from WAD into Web Audio API AudioBuffers.
// DMX format: 8-byte header (uint16 format=3, uint16 sampleRate, uint32 numSamples)
// followed by unsigned 8-bit PCM data (128 = silence).
// Ported from i_sound.c

import type { WAD } from '../wad/types';
import { getLump } from '../wad/WADParser';

// Sound name → WAD lump name mapping (DS prefix per sounds.c)
const SFX_LUMP_MAP: Record<string, string> = {
  doropn: 'DSDOROPN',
  dorcls: 'DSDORCLS',
  bdopn: 'DSBDOPN',
  bdcls: 'DSBDCLS',
  pstart: 'DSPSTART',
  pstop: 'DSPSTOP',
  stnmov: 'DSSTNMOV',
  swtchn: 'DSSWTCHN',
  swtchx: 'DSSWTCHX',
  oof: 'DSOOF',
  noway: 'DSNOWAY',
  itemup: 'DSITEMUP',
  wpnup: 'DSWPNUP',
  getpow: 'DSGETPOW',
  // Weapon sounds
  pistol: 'DSPISTOL',
  shotgn: 'DSSHOTGN',
  dshtgn: 'DSDSHTGN',
  dbopn: 'DSDBOPN',
  dbcls: 'DSDBCLS',
  dbload: 'DSDBLOAD',
  rlaunc: 'DSRLAUNC',
  plasma: 'DSPLASMA',
  bfg: 'DSBFG',
  punch: 'DSPUNCH',
  sawup: 'DSSAWUP',
  sawful: 'DSSAWFUL',
  sawidl: 'DSSAWIDL',
  sawhit: 'DSSAWHIT',
  // Barrel / explosion
  barexp: 'DSBAREXP',
  // Player pain / death
  plpain: 'DSPLPAIN',
  pldeth: 'DSPLDETH',
  slop: 'DSSLOP',
};

/**
 * Parse all known sound effects from the WAD into AudioBuffers.
 */
export async function parseSounds(
  wad: WAD,
  audioCtx: AudioContext
): Promise<Record<string, AudioBuffer>> {

  const buffers: Record<string, AudioBuffer> = {};

  for ( const [ name, lumpName ] of Object.entries( SFX_LUMP_MAP ) ) {

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
