// Renders the current weapon sprite as a 2D canvas overlay.
// Ported from R_DrawPSprite / R_DrawPlayerSprites in r_things.c.

import type { SpriteFrame } from '../wad/types';
import type { WeaponSystem } from '../game/Weapons';
import { fixedToFloat } from '../math/fixed';

// Doom's virtual screen dimensions
const DOOM_W = 320;
const DOOM_H = 200;

export class WeaponOverlay {

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Pre-rendered sprite frame canvases keyed by lump name
  private frameCache = new Map<string, HTMLCanvasElement>();

  constructor() {

    const gameContainer = document.getElementById( 'game' )!;

    this.canvas = document.createElement( 'canvas' );
    this.canvas.width = DOOM_W;
    this.canvas.height = DOOM_H;
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '50%';
    this.canvas.style.transform = 'translateX(-50%)';
    this.canvas.style.height = '100%';
    this.canvas.style.aspectRatio = `${DOOM_W} / ${DOOM_H}`;
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.zIndex = '8'; // above 3D, below HUD (10)
    this.canvas.style.pointerEvents = 'none';
    gameContainer.appendChild( this.canvas );

    this.ctx = this.canvas.getContext( '2d' )!;

  }

  /** Pre-render a sprite frame to a canvas for fast drawing */
  private getFrameCanvas( name: string, sprites: Record<string, SpriteFrame> ): HTMLCanvasElement | null {

    const cached = this.frameCache.get( name );
    if ( cached ) return cached;

    const frame = sprites[ name ];
    if ( ! frame ) return null;

    const c = document.createElement( 'canvas' );
    c.width = frame.width;
    c.height = frame.height;
    const ctx2 = c.getContext( '2d' )!;
    const imgData = ctx2.createImageData( frame.width, frame.height );
    imgData.data.set( frame.rgba );
    ctx2.putImageData( imgData, 0, 0 );

    this.frameCache.set( name, c );
    return c;

  }

  /** Render current weapon sprite */
  update( weapons: WeaponSystem, sprites: Record<string, SpriteFrame> ): void {

    const ctx = this.ctx;
    ctx.clearRect( 0, 0, DOOM_W, DOOM_H );

    // Draw main weapon sprite
    const wpn = weapons.getWeaponSprite();
    if ( wpn ) this.drawPsprite( wpn, sprites );

    // Draw muzzle flash on top
    const flash = weapons.getFlashSprite();
    if ( flash ) this.drawPsprite( flash, sprites );

  }

  private drawPsprite(
    info: { sprite: string; frame: number; bright: boolean; sx: number; sy: number },
    sprites: Record<string, SpriteFrame>
  ): void {

    // Build lump name: PREFIX + frame letter + '0' (rotation 0)
    const frameLetter = String.fromCharCode( 65 + info.frame );
    const lumpName = info.sprite + frameLetter + '0';

    const frameCanvas = this.getFrameCanvas( lumpName, sprites );
    if ( ! frameCanvas ) return;

    const frame = sprites[ lumpName ];
    if ( ! frame ) return;

    // Convert fixed-point psprite coords to screen pixels
    // sx: FRACUNIT = centered → maps to pixel 160 via (sx/FRACUNIT)*160
    // sy: WEAPONTOP (32*FRACUNIT) → maps to pixel 32
    const sx = fixedToFloat( info.sx );
    const sy = fixedToFloat( info.sy );
    const screenX = Math.floor( sx - frame.leftOffset );
    const screenY = Math.floor( sy - frame.topOffset );

    this.ctx.drawImage( frameCanvas, screenX, screenY );

  }

  dispose(): void {

    this.canvas.remove();

  }

}
