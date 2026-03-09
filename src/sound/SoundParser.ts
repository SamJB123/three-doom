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
  // Teleport
  telept: 'DSTELEPT',
  // Monster see/alert sounds
  posit1: 'DSPOSIT1',
  posit2: 'DSPOSIT2',
  posit3: 'DSPOSIT3',
  bgsit1: 'DSBGSIT1',
  bgsit2: 'DSBGSIT2',
  sgtsit: 'DSSGTSIT',
  cacsit: 'DSCACSIT',
  brssit: 'DSBRSSIT',
  cybsit: 'DSCYBSIT',
  spisit: 'DSSPISIT',
  bspsit: 'DSBSPSIT',
  kntsit: 'DSKNTSIT',
  vilsit: 'DSVILSIT',
  mansit: 'DSMANSIT',
  pesit: 'DSPESIT',
  sklatk: 'DSSKLATK',
  skelsi: 'DSSKELSI',
  // Monster pain sounds
  popain: 'DSPOPAIN',
  dmpain: 'DSDMPAIN',
  pepain: 'DSPEPAIN',
  vipain: 'DSVIPAIN',
  mnpain: 'DSMNPAIN',
  // Monster death sounds
  podth1: 'DSPODTH1',
  podth2: 'DSPODTH2',
  podth3: 'DSPODTH3',
  bgdth1: 'DSBGDTH1',
  bgdth2: 'DSBGDTH2',
  sgtdth: 'DSSGTDTH',
  cacdth: 'DSCACDTH',
  skldth: 'DSSKLDTH',
  brsdth: 'DSBRSDTH',
  cybdth: 'DSCYBDTH',
  spidth: 'DSSPIDTH',
  bspdth: 'DSBSPDTH',
  vildth: 'DSVILDTH',
  kntdth: 'DSKNTDTH',
  mandth: 'DSMANDTH',
  pedth: 'DSPEDTH',
  skedth: 'DSSKEDTH',
  // Monster active/idle sounds
  posact: 'DSPOSACT',
  bgact: 'DSBGACT',
  dmact: 'DSDMACT',
  // Monster attack sounds
  claw: 'DSCLAW',
  skeswg: 'DSSKESWG',
  skepch: 'DSSKEPCH',
  vilatk: 'DSVILATK',
  firxpl: 'DSFIRXPL',
  firsht: 'DSFIRSHT',
  // Footstep / movement sounds
  hoof: 'DSHOOF',
  metal: 'DSMETAL',
  bspwlk: 'DSBSPWLK',
  // Rocket/plasma/BFG hit sounds
  rxplod: 'DSRXPLOD',
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
