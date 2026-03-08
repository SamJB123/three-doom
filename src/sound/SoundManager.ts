// Simple Web Audio sound manager for Doom sound effects.
// Handles playback with automatic AudioContext resume (browsers require
// user gesture before audio can play).

let audioCtx: AudioContext | null = null;
let sfxBuffers: Record<string, AudioBuffer> = {};

export function initSoundManager(
  ctx: AudioContext,
  buffers: Record<string, AudioBuffer>
): void {

  audioCtx = ctx;
  sfxBuffers = buffers;

}

/**
 * Play a sound effect by name (e.g. 'doropn', 'dorcls', 'pstart').
 * Matches original Doom S_StartSound — fire-and-forget, overlapping allowed.
 */
export function playSound( name: string ): void {

  if ( ! audioCtx ) return;

  const buffer = sfxBuffers[ name ];
  if ( ! buffer ) return;

  // Resume context if suspended (browser autoplay policy)
  if ( audioCtx.state === 'suspended' ) {

    audioCtx.resume();

  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect( audioCtx.destination );
  source.start();

}
