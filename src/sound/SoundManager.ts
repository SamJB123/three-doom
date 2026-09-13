// Sound manager with spatial audio support.
// Uses Web Audio API PannerNodes for positional sounds (monsters, doors, etc.)
// and direct connections for non-positional sounds (player weapons, pickups).
// The native Web Audio listener position is updated each frame from the camera.

const SCALE = 1.0 / 32.0;

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
export function setSoundVolume(volume: number): void { if (masterGain) masterGain.gain.value=Math.max(0,Math.min(1,volume)); }

let sfxBuffers: Record<string, AudioBuffer> = {};

export function initSoundManager(
  ctx: AudioContext,
  buffers: Record<string, AudioBuffer>
): void {

  audioCtx = ctx;
  masterGain?.disconnect(); masterGain=ctx.createGain(); masterGain.connect(ctx.destination);
  sfxBuffers = buffers;

}

/**
 * Update the Web Audio listener position and orientation from the camera.
 * Call once per frame so positional sounds attenuate correctly.
 */
export function updateListener( x: number, y: number, z: number, forwardX: number, forwardZ: number ): void {

  if ( ! audioCtx ) return;

  const listener = audioCtx.listener;

  // Use setPosition/setOrientation (widely supported) or the newer properties
  if ( listener.positionX ) {

    listener.positionX.value = x;
    listener.positionY.value = y;
    listener.positionZ.value = z;
    listener.forwardX.value = forwardX;
    listener.forwardY.value = 0;
    listener.forwardZ.value = forwardZ;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;

  }

}

/**
 * Play a non-positional sound effect (player weapons, pickups, UI).
 * Matches original Doom S_StartSound with null origin.
 */
export function playSound( name: string ): void {

  if ( ! audioCtx ) return;

  const buffer = sfxBuffers[ name ];
  if ( ! buffer ) return;

  if ( audioCtx.state === 'suspended' ) audioCtx.resume();

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect( masterGain! );
  source.start();

}

/**
 * Play a positional sound effect at a Doom-space position.
 * The sound is attenuated by distance from the listener (camera).
 *
 * @param name  Sound effect name (e.g. 'doropn', 'posit1')
 * @param x     Doom fixed-point X position
 * @param y     Doom fixed-point Y position
 * @param z     Doom fixed-point Z position (optional, defaults to 0)
 */
export function playSoundAt( name: string, x: number, y: number, z: number = 0 ): void {

  if ( ! audioCtx ) return;

  const buffer = sfxBuffers[ name ];
  if ( ! buffer ) return;

  if ( audioCtx.state === 'suspended' ) audioCtx.resume();

  // Convert Doom fixed-point coords to Three.js world coords
  // Doom: x = east, y = north. Three.js: x = right, y = up, z = -forward
  const FRACBITS = 16;
  const wx = ( x >> FRACBITS ) * SCALE;
  const wy = ( z >> FRACBITS ) * SCALE;
  const wz = - ( y >> FRACBITS ) * SCALE;

  const panner = audioCtx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'linear';
  panner.refDistance = 3;      // full volume within ~3 world units (~96 Doom units)
  panner.maxDistance = 40;     // silence beyond ~40 world units (~1280 Doom units)
  panner.rolloffFactor = 1;
  panner.positionX.value = wx;
  panner.positionY.value = wy;
  panner.positionZ.value = wz;

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect( panner );
  panner.connect( masterGain! );
  source.start();

  // Clean up nodes after playback finishes
  source.onended = () => {

    source.disconnect();
    panner.disconnect();

  };

}
