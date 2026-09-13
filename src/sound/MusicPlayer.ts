// OPL3 chip emulator music player for Doom MUS tracks.
// Uses the browser subset of the opl3 Yamaha YMF262 emulator. See vendor
// provenance and PCM regression evidence; original driver parity is unverified.

// @ts-expect-error -- opl3 has no type declarations
import OPL3 from '../vendor/opl3/opl3.js';
// @ts-expect-error -- opl3 has no type declarations
import MUSFormat from '../vendor/opl3/mus.js';

export class MusicPlayer {

  private playing = false;
  private genmidiData: ArrayBuffer | null = null;
  private player: unknown = null;
  private ctx: AudioContext;
  private gainNode: GainNode;

  constructor( audioCtx: AudioContext ) {

    this.ctx = audioCtx;
    this.gainNode = audioCtx.createGain();
    this.gainNode.gain.value = 0.7;
    this.gainNode.connect( audioCtx.destination );

  }

  setGenmidiData( data: ArrayBuffer ): void {

    this.genmidiData = data;

  }

  setVolume( v: number ): void {

    this.gainNode.gain.value = Math.max( 0, Math.min( 1, v ) );

  }

  play( musData: ArrayBuffer ): void {

    this.stop();

    if ( this.ctx.state === 'suspended' ) this.ctx.resume();

    this.playing = true;

    const options: Record<string, unknown> = {};

    if ( this.genmidiData ) {

      options.instruments = this.genmidiData;

    }

    // The opl3 library renders MUS → OPL3 registers → PCM audio.
    // We use ScriptProcessorNode (or AudioWorklet in future) to stream it.
    const opl = new OPL3();
    const musPlayer = new MUSFormat( opl, options );

    musPlayer.load( new Uint8Array( musData ) );

    this.player = musPlayer;


    const OPL_RATE = 49700;
    const outRate = this.ctx.sampleRate;
    const bufferSize = 4096;
    const processor = this.ctx.createScriptProcessor( bufferSize, 0, 2 );

    // We generate OPL samples at 49700Hz and do nearest-neighbour resampling
    // to the output sample rate. Track fractional position.
    let eventFrames = 0;
    let finished = false;

    // Ring buffer of OPL samples for resampling
    const oplBuf = new Float32Array( 65536 * 2 ); // large enough for any chunk
    let oplBufLen = 0;
    let oplBufPos = 0;
    let resampleFrac = 0;

    processor.onaudioprocess = ( e: AudioProcessingEvent ) => {

      if ( ! this.playing || finished ) {

        e.outputBuffer.getChannelData( 0 ).fill( 0 );
        e.outputBuffer.getChannelData( 1 ).fill( 0 );
        return;

      }

      const left = e.outputBuffer.getChannelData( 0 );
      const right = e.outputBuffer.getChannelData( 1 );

      for ( let writePos = 0; writePos < bufferSize; writePos ++ ) {

        // Generate more OPL samples when we've consumed them all
        while ( oplBufPos >= oplBufLen ) {

          // A long MUS rest can exceed the ring buffer: generate it in bounded
          // chunks without consuming the next event before its delay has elapsed.
          if(eventFrames<=0) {
            if(!musPlayer.update()) {
              musPlayer.rewind();
              if(!musPlayer.update()){finished=true;left.fill(0,writePos);right.fill(0,writePos);return;}
            }
            eventFrames=Math.max(1,Math.floor(musPlayer.refresh()*OPL_RATE));
          }
          const count=Math.min(eventFrames,oplBuf.length/2);
          eventFrames-=count;

          // Generate OPL samples (interleaved stereo Float32)
          const chunk = new Float32Array( count * 2 );
          opl.read( chunk );

          oplBuf.set( chunk );
          oplBufLen = count;
          oplBufPos = 0;

        }

        // Nearest-neighbour resample from OPL_RATE to outRate
        const idx = oplBufPos;
        left[ writePos ] = oplBuf[ idx * 2 ];
        right[ writePos ] = oplBuf[ idx * 2 + 1 ];

        resampleFrac += OPL_RATE;

        while ( resampleFrac >= outRate ) {

          resampleFrac -= outRate;
          oplBufPos ++;

        }

      }

    };

    processor.connect( this.gainNode );

    // Store reference for cleanup
    ( this as Record<string, unknown> )._processor = processor;

  }

  stop(): void {

    this.playing = false;

    const proc = ( this as Record<string, unknown> )._processor as AudioNode | undefined;

    if ( proc ) {

      proc.disconnect();
      ( this as Record<string, unknown> )._processor = null;

    }

    this.player = null;

  }

  isPlaying(): boolean {

    return this.playing;

  }

}
