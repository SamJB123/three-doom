// Doom status bar HUD — renders the classic STBAR at the bottom of the screen
// using a 2D canvas overlay. All graphics come from WAD patch lumps.

import type { WAD, Palette } from '../wad';
import { getLump, parsePatch } from '../wad';
import type { World } from 'koota';
import type { AmmoType, WeaponSlot, CardType, PlayerStatusState } from '../ecs/traits';
import { PlayerStatus, Time, Input, AMMO_TYPES, WEAPON_SLOTS } from '../ecs/traits';

// Doom's virtual screen dimensions
const DOOM_W = 320;
const ST_HEIGHT = 32;
const ST_Y = 0; // relative to the status bar canvas (which is only 32px tall)

// HUD element positions (X coords from st_stuff.c, Y relative to status bar top)
const ST_AMMOX = 44;
const ST_AMMOY = 3;
const ST_HEALTHX = 90;
const ST_HEALTHY = 3;
const ST_ARMORX = 221;
const ST_ARMORY = 3;

// Arms display
const ST_ARMSX = 111;
const ST_ARMSY = 4;
const ST_ARMSXSPACE = 12;
const ST_ARMSYSPACE = 10;

// Face
const ST_FACESX = 143;
const ST_FACESY = 0;

// Keys
const ST_KEY0X = 239;
const ST_KEY0Y = 3;
const ST_KEY1X = 239;
const ST_KEY1Y = 13;
const ST_KEY2X = 239;
const ST_KEY2Y = 23;

// Small ammo counts (right side)
const ST_AMMO0X = 288;
const ST_AMMO0Y = 5;
const ST_AMMO1X = 288;
const ST_AMMO1Y = 11;
const ST_AMMO2X = 288;
const ST_AMMO2Y = 23;
const ST_AMMO3X = 288;
const ST_AMMO3Y = 17;

const ST_MAXAMMO0X = 314;
const ST_MAXAMMO0Y = 5;
const ST_MAXAMMO1X = 314;
const ST_MAXAMMO1Y = 11;
const ST_MAXAMMO2X = 314;
const ST_MAXAMMO2Y = 23;
const ST_MAXAMMO3X = 314;
const ST_MAXAMMO3Y = 17;

interface HudPatch {
  width: number;
  height: number;
  leftOffset: number;
  topOffset: number;
  canvas: HTMLCanvasElement; // pre-rendered for drawImage with transparency
}

// Screen tint constants (from ST_doPaletteStuff in st_stuff.c)
const NUMREDPALS = 8;
const NUMBONUSPALS = 4;

// Face constants (from st_stuff.c, matching original Doom exactly)
const ST_NUMPAINFACES = 5;
const ST_FACESTRIDE = 8;
const ST_NUMEXTRAFACES = 2;
const ST_NUMFACES = ST_FACESTRIDE * ST_NUMPAINFACES + ST_NUMEXTRAFACES;
const ST_STRAIGHTFACECOUNT = 17; // TICRATE/2 ≈ 17 tics between idle face changes
const ST_EVILGRINCOUNT = 70;     // 2 seconds
const ST_EVILGRINOFFSET = 6;     // offset within pain stride for evil grin
const ST_TURNOFFSET = 3;         // turn right face offset in stride
const ST_OUCHOFFSET = 5;         // ouch face offset in stride
const ST_RAMPAGEOFFSET = 7;      // rampage/kill face offset in stride
const ST_MUCHPAIN = 20;          // health drop threshold for ouch face
const ST_TURNCOUNT = 35;         // 1 * TICRATE — how long turn face lasts
const ST_OUCHCOUNT = 35;         // how long ouch face lasts
const ST_RAMPAGECOUNT = 35;      // how long rampage face lasts
const ST_GODFACE = ST_NUMPAINFACES * ST_FACESTRIDE; // index 40

export class StatusBar {

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tintOverlay: HTMLDivElement;

  // Loaded patches
  private stbar: HudPatch | null = null;
  private tallNums: ( HudPatch | null )[] = [];
  private shortNums: ( HudPatch | null )[] = [];
  private tallPercent: HudPatch | null = null;
  private tallMinus: HudPatch | null = null;
  private keys: ( HudPatch | null )[] = [];
  private faces: ( HudPatch | null )[] = [];
  private armsBg: HudPatch | null = null;
  private grayNums: ( HudPatch | null )[] = []; // STGNUM2-7 (gray weapon numbers)

  // Face state — matches Doom's st_facecount / st_faceindex / priority system
  private faceIndex = 0;
  private faceCount = ST_STRAIGHTFACECOUNT; // counts DOWN in Doom tics
  private facePriority = 0;
  private faceTicAccum = 0; // accumulates delta time, fires tics at 35Hz
  private faceBgPatch: HudPatch | null = null; // STFB0 for centering
  private oldWeapons: Record<WeaponSlot, boolean> = {
    fist: true, pistol: true, shotgun: false, chaingun: false,
    missile: false, plasma: false, bfg: false, chainsaw: false, supershotgun: false
  };
  private oldHealth = 100;         // st_oldhealth — tracks previous health for damage detection
  private lastAttackDown = false;  // for rampage face detection

  constructor() {

    this.canvas = document.createElement( 'canvas' );
    this.canvas.width = DOOM_W;
    this.canvas.height = ST_HEIGHT;
    this.canvas.style.position = 'fixed';
    this.canvas.style.bottom = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = 'auto';
    this.canvas.style.aspectRatio = `${ DOOM_W } / ${ ST_HEIGHT }`;
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.zIndex = '10';
    this.canvas.style.pointerEvents = 'none';
    document.body.appendChild( this.canvas );

    this.ctx = this.canvas.getContext( '2d' )!;

    // Fullscreen tint overlay for palette effects (berserk red, pickup gold, ironfeet green)
    this.tintOverlay = document.createElement( 'div' );
    this.tintOverlay.style.position = 'fixed';
    this.tintOverlay.style.inset = '0';
    this.tintOverlay.style.pointerEvents = 'none';
    this.tintOverlay.style.zIndex = '5';
    document.body.appendChild( this.tintOverlay );

  }

  loadGraphics( wad: WAD, palette: Palette ): void {

    // Status bar background
    this.stbar = this.loadPatch( wad, palette, 'STBAR' );

    // Tall numbers 0-9
    for ( let i = 0; i <= 9; i ++ ) {

      this.tallNums.push( this.loadPatch( wad, palette, 'STTNUM' + i ) );

    }

    // Short yellow numbers 0-9
    for ( let i = 0; i <= 9; i ++ ) {

      this.shortNums.push( this.loadPatch( wad, palette, 'STYSNUM' + i ) );

    }

    // Percent and minus
    this.tallPercent = this.loadPatch( wad, palette, 'STTPRCNT' );
    this.tallMinus = this.loadPatch( wad, palette, 'STTMINUS' );

    // Keys
    for ( let i = 0; i <= 5; i ++ ) {

      this.keys.push( this.loadPatch( wad, palette, 'STKEYS' + i ) );

    }

    // Arms background
    this.armsBg = this.loadPatch( wad, palette, 'STARMS' );

    // Gray weapon numbers (2-7)
    for ( let i = 2; i <= 7; i ++ ) {

      this.grayNums.push( this.loadPatch( wad, palette, 'STGNUM' + i ) );

    }

    // Face background (used to determine centering area)
    this.faceBgPatch = this.loadPatch( wad, palette, 'STFB0' );

    // Faces — load all 40 standard faces + 2 extra (god, dead)
    const faceNames = this.buildFaceLumpNames();

    for ( const name of faceNames ) {

      this.faces.push( this.loadPatch( wad, palette, name ) );

    }

  }

  private buildFaceLumpNames(): string[] {

    const names: string[] = [];

    // For each pain level (0-4), 8 faces in order:
    //   ST00, ST01, ST02 (straight), TR0 (turn right), TL0 (turn left),
    //   OUCH0 (ouch), EVL0 (evil grin), KILL0 (rampage)
    for ( let pain = 0; pain < ST_NUMPAINFACES; pain ++ ) {

      // 3 straight faces
      names.push( `STFST${ pain }0` );
      names.push( `STFST${ pain }1` );
      names.push( `STFST${ pain }2` );

      // Turn right, turn left
      names.push( `STFTR${ pain }0` );
      names.push( `STFTL${ pain }0` );

      // Ouch, evil grin, rampage
      names.push( `STFOUCH${ pain }` );
      names.push( `STFEVL${ pain }` );
      names.push( `STFKILL${ pain }` );

    }

    // Extra faces
    names.push( 'STFGOD0' );  // God mode
    names.push( 'STFDEAD0' ); // Dead

    return names;

  }

  private loadPatch( wad: WAD, palette: Palette, name: string ): HudPatch | null {

    const lump = getLump( wad, name );
    if ( ! lump ) return null;

    const patch = parsePatch( wad, lump.offset );
    const { width, height, leftOffset, topOffset, pixels } = patch;

    const imageData = new ImageData( width, height );

    for ( let i = 0; i < width * height; i ++ ) {

      const idx = pixels[ i ];

      if ( idx >= 0 ) {

        imageData.data[ i * 4 ] = palette[ idx * 3 ];
        imageData.data[ i * 4 + 1 ] = palette[ idx * 3 + 1 ];
        imageData.data[ i * 4 + 2 ] = palette[ idx * 3 + 2 ];
        imageData.data[ i * 4 + 3 ] = 255;

      }

    }

    // Pre-render to a small canvas for drawImage (supports transparency)
    const c = document.createElement( 'canvas' );
    c.width = width;
    c.height = height;
    c.getContext( '2d' )!.putImageData( imageData, 0, 0 );

    return { width, height, leftOffset, topOffset, canvas: c };

  }

  update( world: World ): void {

    const state = world.get( PlayerStatus );
    const time = world.get( Time );
    if ( ! state ) return;
    const dt = time ? time.delta : 0;

    const ctx = this.ctx;

    // Clear
    ctx.clearRect( 0, 0, DOOM_W, ST_HEIGHT );

    // Draw status bar background
    this.drawPatch( this.stbar, 0, ST_Y );

    // Draw arms background over the status bar
    this.drawPatch( this.armsBg, 104, ST_Y );

    // Current ammo (large, left side)
    this.drawTallNumber( state.ammo[ state.currentAmmo ], ST_AMMOX, ST_AMMOY, 3 );

    // Health %
    this.drawTallNumber( state.health, ST_HEALTHX, ST_HEALTHY, 3 );
    this.drawPatch( this.tallPercent, ST_HEALTHX, ST_HEALTHY );

    // Armor %
    this.drawTallNumber( state.armor, ST_ARMORX, ST_ARMORY, 3 );
    this.drawPatch( this.tallPercent, ST_ARMORX, ST_ARMORY );

    // Arms display: weapons 1-6 (pistol through BFG), labeled 2-7 in the grid
    // Original: weaponowned[i+1] for i=0..5, shortnum[i+2] for labels
    const armsWeapons: WeaponSlot[] = [ 'pistol', 'shotgun', 'chaingun', 'missile', 'plasma', 'bfg' ];

    for ( let i = 0; i < 6; i ++ ) {

      const col = i % 3;
      const row = Math.floor( i / 3 );
      const x = ST_ARMSX + col * ST_ARMSXSPACE;
      const y = ST_ARMSY + row * ST_ARMSYSPACE;

      if ( state.weapons[ armsWeapons[ i ] ] ) {

        // Owned: yellow number (2-7, matching original WAD graphics)
        this.drawPatch( this.shortNums[ i + 2 ], x, y );

      } else {

        // Not owned: gray number
        this.drawPatch( this.grayNums[ i ], x, y );

      }

    }

    // Track attack button for rampage face
    const inputState = world.get( Input );
    const attacking = inputState ? inputState.attack : false;

    // Face — center in the face background area, clip to prevent overflow
    this.updateFace( state, dt, attacking );
    const facePatch = this.faces[ this.faceIndex ] || null;

    if ( facePatch ) {

      const bgW = this.faceBgPatch ? this.faceBgPatch.width : facePatch.width;
      const bgH = this.faceBgPatch ? this.faceBgPatch.height : facePatch.height;
      const faceX = ST_FACESX + Math.floor( ( bgW - facePatch.width ) / 2 );
      const faceY = ST_FACESY + Math.floor( ( bgH - facePatch.height ) / 2 );
      this.drawPatch( facePatch, faceX, faceY );

    }

    // Keys
    const keyPositions = [
      [ ST_KEY0X, ST_KEY0Y ],
      [ ST_KEY1X, ST_KEY1Y ],
      [ ST_KEY2X, ST_KEY2Y ]
    ];

    // Key pairs: [cardKey, skullKey] for each row (blue, yellow, red)
    const keyPairs: [ CardType, CardType ][] = [
      [ 'bluecard', 'blueskull' ],
      [ 'yellowcard', 'yellowskull' ],
      [ 'redcard', 'redskull' ]
    ];

    for ( let i = 0; i < 3; i ++ ) {

      const [ card, skull ] = keyPairs[ i ];

      // Check for skull key first, then keycard
      if ( state.cards[ skull ] ) {

        this.drawPatch( this.keys[ i + 3 ], keyPositions[ i ][ 0 ], keyPositions[ i ][ 1 ] );

      } else if ( state.cards[ card ] ) {

        this.drawPatch( this.keys[ i ], keyPositions[ i ][ 0 ], keyPositions[ i ][ 1 ] );

      }

    }

    // Small ammo counts (right side)
    const ammoPositions = [
      [ ST_AMMO0X, ST_AMMO0Y, ST_MAXAMMO0X, ST_MAXAMMO0Y ],
      [ ST_AMMO1X, ST_AMMO1Y, ST_MAXAMMO1X, ST_MAXAMMO1Y ],
      [ ST_AMMO2X, ST_AMMO2Y, ST_MAXAMMO2X, ST_MAXAMMO2Y ],
      [ ST_AMMO3X, ST_AMMO3Y, ST_MAXAMMO3X, ST_MAXAMMO3Y ]
    ];

    for ( let i = 0; i < 4; i ++ ) {

      const [ ax, ay, mx, my ] = ammoPositions[ i ];
      const at = AMMO_TYPES[ i ];
      this.drawShortNumber( state.ammo[ at ], ax, ay, 3 );
      this.drawShortNumber( state.maxAmmo[ at ], mx, my, 3 );

    }

    // Screen tint — ported from ST_doPaletteStuff (st_stuff.c)
    this.updateScreenTint( state );

  }

  // Ported from ST_updateFaceWidget in st_stuff.c
  // Accumulates delta time and fires face tics at exactly 35Hz.
  private updateFace( state: PlayerStatusState, dt: number, attacking: boolean ): void {

    const TIC_SEC = 1 / 35;
    this.faceTicAccum += dt;

    // Process whole tics (usually 0 or 1 per render frame)
    while ( this.faceTicAccum >= TIC_SEC ) {

      this.faceTicAccum -= TIC_SEC;

      const randomNumber = Math.floor( Math.random() * 256 );

      // Pain offset: maps health 0-100 to pain level 0-4
      const painOffset = Math.max( 0, Math.min(
        ST_NUMPAINFACES - 1,
        Math.floor( ( ( 100 - Math.max( 0, state.health ) ) * ST_NUMPAINFACES ) / 101 )
      ) ) * ST_FACESTRIDE;

      // Priority 9: Dead
      if ( this.facePriority < 10 && state.health <= 0 ) {

        this.facePriority = 9;
        this.faceIndex = ST_NUMFACES - 1; // STFDEAD0
        this.faceCount = 1;

      }

      // Priority 8: Evil grin when picking up a new weapon
      if ( this.facePriority < 9 && state.bonusCount > 0 ) {

        let newWeapon = false;

        for ( const ws of WEAPON_SLOTS ) {

          if ( state.weapons[ ws ] && ! this.oldWeapons[ ws ] ) {

            newWeapon = true;
            this.oldWeapons[ ws ] = true;

          }

        }

        if ( newWeapon ) {

          this.facePriority = 8;
          this.faceCount = ST_EVILGRINCOUNT;
          this.faceIndex = painOffset + ST_EVILGRINOFFSET;

        }

      }

      // Priority 7: Damage taken (from attacker or environment)
      // Detect health drop by comparing against oldHealth
      if ( this.facePriority < 8 ) {

        const healthDrop = this.oldHealth - state.health;

        if ( healthDrop > 0 && state.damageCount > 0 ) {

          if ( healthDrop > ST_MUCHPAIN ) {

            // Ouch face — big damage (priority 7)
            this.facePriority = 7;
            this.faceCount = ST_OUCHCOUNT;
            this.faceIndex = painOffset + ST_OUCHOFFSET;

          } else {

            // Rampage/kill face for smaller damage (priority 7)
            // In original, attacker angle determines turn face direction.
            // Without attacker tracking, use rampage face for self/env damage.
            this.facePriority = 7;
            this.faceCount = ST_TURNCOUNT;
            // Random direction: turn left or right, or straight rampage
            const rnd = randomNumber % 3;
            if ( rnd === 0 ) {

              this.faceIndex = painOffset + ST_TURNOFFSET; // turn right

            } else if ( rnd === 1 ) {

              this.faceIndex = painOffset + ST_TURNOFFSET + 1; // turn left

            } else {

              this.faceIndex = painOffset + ST_RAMPAGEOFFSET; // rampage

            }

          }

        }

      }

      // Priority 5: Rampage — holding fire for sustained attack
      if ( this.facePriority < 6 && state.playerState === 'PST_LIVE' ) {

        if ( attacking && this.lastAttackDown && state.damageCount <= 0 ) {

          // Rampage shows when holding fire for 2+ tics without taking damage
          this.facePriority = 5;
          this.faceIndex = painOffset + ST_RAMPAGEOFFSET;
          this.faceCount = ST_RAMPAGECOUNT;

        }

      }

      this.lastAttackDown = attacking;

      // Priority 4: Invulnerability (god face)
      if ( this.facePriority < 5 && state.powers.invulnerability > 0 ) {

        this.facePriority = 4;
        this.faceIndex = ST_GODFACE;
        this.faceCount = 1;

      }

      // When the display timer expires, revert to idle (random straight face)
      if ( this.faceCount === 0 ) {

        this.faceIndex = painOffset + ( randomNumber % 3 );
        this.faceCount = ST_STRAIGHTFACECOUNT;
        this.facePriority = 0;

      }

      this.faceCount --;

      // Update old health at end of tic (matches ST_Ticker setting st_oldhealth)
      this.oldHealth = state.health;

    }

  }

  // Ported from ST_doPaletteStuff (st_stuff.c)
  // Maps game state → fullscreen color tint overlay.
  private updateScreenTint( state: PlayerStatusState ): void {

    // Damage red (highest priority) + berserk red
    // From ST_doPaletteStuff: cnt = max(damageCount, berserk fade)
    let cnt = state.damageCount;

    if ( state.powers.strength ) {

      const bzc = 12 - ( state.powers.strength >> 6 );
      if ( bzc > cnt ) cnt = bzc;

    }

    if ( cnt > 0 ) {

      // Red tint (damage / berserk)
      let pal = ( cnt + 7 ) >> 3;
      if ( pal >= NUMREDPALS ) pal = NUMREDPALS - 1;
      this.tintOverlay.style.backgroundColor = `rgba(255, 0, 0, ${ pal / 16 })`;

    } else if ( state.bonusCount > 0 ) {

      // Gold tint (item pickup)
      let pal = ( state.bonusCount + 7 ) >> 3;
      if ( pal >= NUMBONUSPALS ) pal = NUMBONUSPALS - 1;
      this.tintOverlay.style.backgroundColor = `rgba(215, 186, 69, ${ pal / 10 })`;

    } else if ( state.powers.ironfeet > 4 * 32 || ( state.powers.ironfeet & 8 ) ) {

      // Green tint (radiation suit) — flickers near expiry
      this.tintOverlay.style.backgroundColor = 'rgba(0, 215, 0, 0.12)';

    } else {

      this.tintOverlay.style.backgroundColor = 'transparent';

    }

  }

  private drawPatch( patch: HudPatch | null, x: number, y: number ): void {

    if ( ! patch ) return;
    this.ctx.drawImage( patch.canvas, x, y - Math.floor( patch.topOffset / 2 ) );

  }

  private drawTallNumber( value: number, x: number, y: number, maxDigits: number ): void {

    this.drawNumber( value, x, y, maxDigits, this.tallNums, this.tallMinus );

  }

  private drawShortNumber( value: number, x: number, y: number, maxDigits: number ): void {

    this.drawNumber( value, x, y, maxDigits, this.shortNums, null );

  }

  // Draw a right-justified number. X is the right edge of the rightmost digit.
  private drawNumber(
    value: number,
    x: number,
    y: number,
    maxDigits: number,
    nums: ( HudPatch | null )[],
    minusPatch: HudPatch | null
  ): void {

    const negative = value < 0;
    let num = Math.abs( Math.floor( value ) );
    const digitWidth = nums[ 0 ]?.width ?? 14;

    // Draw digits right-to-left
    let drawX = x;

    for ( let i = 0; i < maxDigits; i ++ ) {

      const digit = num % 10;
      num = Math.floor( num / 10 );
      drawX -= digitWidth;
      this.drawPatch( nums[ digit ], drawX, y );

      if ( num === 0 && ! negative ) break;
      if ( num === 0 && negative ) {

        drawX -= digitWidth;
        this.drawPatch( minusPatch, drawX, y );
        break;

      }

    }

  }

  dispose(): void {

    this.canvas.remove();
    this.tintOverlay.remove();

  }

}
