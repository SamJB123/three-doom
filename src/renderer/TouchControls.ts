// Virtual touch controls for mobile — dual-stick layout inspired by Doom's joystick support.
// Left stick: movement (forward/back + strafe)
// Right stick: look (yaw + pitch)
// Buttons: fire, use, weapon prev/next, run toggle

import type { World } from 'koota';
import { Input } from '../ecs/traits';

// Layout constants (percentage of viewport)
const STICK_RADIUS = 50;      // pixels — outer ring radius
const STICK_DEAD = 10;        // dead zone in pixels
const ACTION_ZONE_FRACTION = 0.4;
const MARGIN = 20;            // edge margin

// Look sensitivity (scaled to match mouse look feel)
const LOOK_SPEED_X = 0.04;
const LOOK_SPEED_Y = 0.03;

interface StickState {
  id: number | null;      // touch identifier
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  active: boolean;
}

export class TouchControls {

  private container: HTMLDivElement;
  private enabled = false;

  // Stick state
  private leftStick: StickState = { id: null, originX: 0, originY: 0, currentX: 0, currentY: 0, active: false };
  private rightStick: StickState = { id: null, originX: 0, originY: 0, currentX: 0, currentY: 0, active: false };

  // Look accumulator (persists across frames like mouse yaw/pitch)
  private yaw = 0;
  private pitch = 0;

  // Button state
  private fireDown = false;
  private useDown = false;
  private runActive = false; // sprint while left thumb is in sprint zone

  // Weapon cycling
  private currentWeaponSlot = 2; // pistol
  private weaponSelectPending = - 1;

  // DOM elements for visual feedback
  private leftRing!: HTMLDivElement;
  private leftKnob!: HTMLDivElement;
  private rightRing!: HTMLDivElement;
  private rightKnob!: HTMLDivElement;

  // Idle hint elements (visible until first touch)
  private leftHint!: HTMLDivElement;
  private rightHint!: HTMLDivElement;
  private hintsVisible = true;

  // Touch detection — only true for primarily-touch devices (phones/tablets),
  // not desktop/laptops that happen to support touch or pen input.
  static isTouchDevice(): boolean {

    if ( ! ( ( 'ontouchstart' in window ) || navigator.maxTouchPoints > 0 ) ) return false;
    // If the primary pointer is fine (mouse), treat as desktop even if touch is available
    return ! window.matchMedia( '(pointer: fine)' ).matches;

  }

  constructor( private world: World ) {

    // Container covers the full screen, sits above HUD so buttons are tappable
    this.container = document.createElement( 'div' );
    this.container.id = 'touch-controls';
    this.container.style.cssText = `
      position: fixed; inset: 0; z-index: 15;
      pointer-events: none; touch-action: none;
      user-select: none; -webkit-user-select: none;
    `;
    document.body.appendChild( this.container );

    this.createSticks();
    this.createButtons();
    this.createHints();
    this.bindEvents();
    this.setEnabled( false );

  }

  setEnabled( enabled: boolean ): void {
    this.enabled = enabled;
    this.container.style.display = enabled ? '' : 'none';
    this.leftStick.active = this.rightStick.active = false;
    this.leftStick.id = this.rightStick.id = null;
    this.fireDown = this.useDown = this.runActive = false;
    this.weaponSelectPending = -1;
    this.hideStick( this.leftRing, this.leftKnob );
    this.hideStick( this.rightRing, this.rightKnob );
    this.world.set( Input, { forward: 0, strafe: 0, vertical: 0, jump: false,
      run: false, use: false, attack: false, weaponSelect: -1,
      yaw: this.yaw, pitch: this.pitch } );
  }

  setInitialYaw( yaw: number, pitch = 0 ): void {
    this.pitch = pitch;

    this.yaw = yaw;

  }

  private createSticks(): void {

    // Left stick (movement)
    const leftArea = this.createStickArea( 'left' );
    this.leftRing = leftArea.ring;
    this.leftKnob = leftArea.knob;

    // Right stick (look)
    const rightArea = this.createStickArea( 'right' );
    this.rightRing = rightArea.ring;
    this.rightKnob = rightArea.knob;

  }

  private createStickArea( side: 'left' | 'right' ): { ring: HTMLDivElement; knob: HTMLDivElement } {

    const d = STICK_RADIUS * 2;

    const ring = document.createElement( 'div' );
    ring.style.cssText = `
      position: fixed;
      bottom: ${ MARGIN + 60 }px;
      ${ side }: ${ MARGIN }px;
      width: ${ d }px; height: ${ d }px;
      border: 2px solid rgba(255,255,255,0.25);
      border-radius: 50%;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
    `;
    this.container.appendChild( ring );

    const knobSize = STICK_RADIUS * 0.7;
    const knob = document.createElement( 'div' );
    knob.style.cssText = `
      position: absolute;
      left: ${ ( d - knobSize ) / 2 }px;
      top: ${ ( d - knobSize ) / 2 }px;
      width: ${ knobSize }px; height: ${ knobSize }px;
      background: rgba(255,255,255,0.3);
      border-radius: 50%;
      pointer-events: none;
    `;
    ring.appendChild( knob );

    return { ring, knob };

  }

  private createButtons(): void {

    // USE button — top-center, out of the way of stick zones
    const useBtn = document.createElement( 'div' );
    useBtn.textContent = '🚪';
    useBtn.style.cssText = `
      position: fixed;
      top: max(${ MARGIN }px, env(safe-area-inset-top)); left: max(${ MARGIN }px, env(safe-area-inset-left));
      width: 56px; height: 56px;
      background: rgba(0,0,0,0.5);
      border: 2px solid rgba(255,255,255,0.5);
      border-radius: 50%;
      font-size: 24px;
      display: flex; align-items: center; justify-content: center;
      pointer-events: auto; touch-action: none;
      user-select: none; -webkit-user-select: none;
    `;
    useBtn.addEventListener( 'touchstart', ( e ) => { e.preventDefault(); this.useDown = true; useBtn.style.background = 'rgba(255,255,255,0.3)'; } );
    useBtn.addEventListener( 'touchend', ( e ) => { e.preventDefault(); this.useDown = false; useBtn.style.background = 'rgba(0,0,0,0.5)'; } );
    useBtn.addEventListener( 'touchcancel', () => { this.useDown = false; useBtn.style.background = 'rgba(0,0,0,0.5)'; } );
    this.container.appendChild( useBtn );

    // Weapon prev/next — positioned over the ARMS section of the status bar.
    // Status bar is 320 virtual px wide, ARMS starts at x=111, width ~32px.
    // As percentage: center ≈ (111 + 16) / 320 ≈ 39.7%
    const wpnY = 'bottom: 0';
    const wpnH = '10vw'; // match status bar height roughly
    const wpnW = '13vw';

    const prevBtn = document.createElement( 'div' );
    prevBtn.textContent = '◀';
    prevBtn.style.cssText = `
      position: fixed; ${ wpnY };
      left: 31%; width: ${ wpnW }; height: ${ wpnH };
      background: rgba(0,0,0,0.01);
      color: rgba(255,255,255,0.5);
      font-size: 14px;
      display: flex; align-items: center; justify-content: center;
      pointer-events: auto; touch-action: none;
      user-select: none; -webkit-user-select: none;
    `;
    prevBtn.addEventListener( 'touchstart', ( e ) => {
      e.preventDefault();
      this.currentWeaponSlot = Math.max( 1, this.currentWeaponSlot - 1 );
      this.weaponSelectPending = this.currentWeaponSlot;
    } );
    this.container.appendChild( prevBtn );

    const nextBtn = document.createElement( 'div' );
    nextBtn.textContent = '▶';
    nextBtn.style.cssText = `
      position: fixed; ${ wpnY };
      left: 44%; width: ${ wpnW }; height: ${ wpnH };
      background: rgba(0,0,0,0.01);
      color: rgba(255,255,255,0.5);
      font-size: 14px;
      display: flex; align-items: center; justify-content: center;
      pointer-events: auto; touch-action: none;
      user-select: none; -webkit-user-select: none;
    `;
    nextBtn.addEventListener( 'touchstart', ( e ) => {
      e.preventDefault();
      this.currentWeaponSlot = Math.min( 7, this.currentWeaponSlot + 1 );
      this.weaponSelectPending = this.currentWeaponSlot;
    } );
    this.container.appendChild( nextBtn );

  }

  private createHints(): void {

    const makeHint=(action:'sprint'|'fire',icon:string):HTMLDivElement=>{
      const hint=document.createElement('div');hint.dataset.touchAction=action;
      hint.style.cssText=`position:absolute; width:50%; height:${ACTION_ZONE_FRACTION*100}%;
        ${action==='sprint'?'top:0;left:0':'bottom:0;right:0'};
        box-sizing:border-box; border:1px dashed rgba(255,255,255,.18);
        background:rgba(255,255,255,.025); pointer-events:none;
        display:flex; align-items:${action==='fire'?'flex-start':'center'}; justify-content:center;
        ${action==='fire'?'padding-top:5vmin;':''} transition:opacity .6s;`;
      hint.innerHTML=`<span style="text-align:center;color:rgba(255,255,255,.5);font:bold 12px monospace;">
        <span style="font-size:5vmin">${icon}</span><br>${action.toUpperCase()}</span>`;
      this.container.append(hint);return hint;
    };
    this.leftHint=makeHint('sprint','🏃');
    this.rightHint=makeHint('fire','🔫');
  }

  private hideHints(): void {

    if ( ! this.hintsVisible ) return;
    this.hintsVisible = false;
    this.leftHint.style.opacity = '0.4';
    this.rightHint.style.opacity = '0.4';

  }


  private bindEvents(): void {

    // Touch zones: left half = movement stick, right half = look stick
    // Buttons have their own pointer-events and are handled separately
    const zone = document.createElement( 'div' );
    zone.id='touch-input-zone';
    zone.style.cssText = `
      position: fixed; inset: 0;
      pointer-events: auto; touch-action: none;
      z-index: -1;
    `;
    this.container.appendChild( zone );

    zone.addEventListener( 'touchstart', this.onTouchStart.bind( this ), { passive: false } );
    zone.addEventListener( 'touchmove', this.onTouchMove.bind( this ), { passive: false } );
    zone.addEventListener( 'touchend', this.onTouchEnd.bind( this ), { passive: false } );
    zone.addEventListener( 'touchcancel', this.onTouchEnd.bind( this ), { passive: false } );

  }

  private onTouchStart( e: TouchEvent ): void {

    e.preventDefault();
    this.hideHints();
    const bounds = this.container.getBoundingClientRect();
    const w = bounds.width;
    const h = bounds.height;

    for ( let i = 0; i < e.changedTouches.length; i ++ ) {

      const t = e.changedTouches[ i ];

      if ( t.clientX - bounds.left < w / 2 ) {

        // Left half → movement stick
        // Top 40% of left half = sprint zone: sprint is active for this touch
        if ( ! this.leftStick.active ) {

          this.leftStick.id = t.identifier;
          this.leftStick.originX = t.clientX;
          this.leftStick.originY = t.clientY;
          this.leftStick.currentX = t.clientX;
          this.leftStick.currentY = t.clientY;
          this.leftStick.active = true;
          this.runActive = t.clientY - bounds.top < h * ACTION_ZONE_FRACTION;
          this.showStick( this.leftRing, this.leftKnob, t.clientX, t.clientY, 0, 0 );

        }

      } else {

        // Right half → look stick
        // Bottom 40% of right half = fire zone: fires while this touch is held
        if ( ! this.rightStick.active ) {

          this.rightStick.id = t.identifier;
          this.rightStick.originX = t.clientX;
          this.rightStick.originY = t.clientY;
          this.rightStick.currentX = t.clientX;
          this.rightStick.currentY = t.clientY;
          this.rightStick.active = true;
          this.fireDown = t.clientY - bounds.top >= h * (1-ACTION_ZONE_FRACTION);
          this.showStick( this.rightRing, this.rightKnob, t.clientX, t.clientY, 0, 0 );

        }

      }

    }

  }

  private onTouchMove( e: TouchEvent ): void {

    e.preventDefault();

    for ( let i = 0; i < e.changedTouches.length; i ++ ) {

      const t = e.changedTouches[ i ];

      if ( this.leftStick.active && t.identifier === this.leftStick.id ) {

        this.leftStick.currentX = t.clientX;
        this.leftStick.currentY = t.clientY;
        const dx = t.clientX - this.leftStick.originX;
        const dy = t.clientY - this.leftStick.originY;
        this.updateKnob( this.leftRing, this.leftKnob, dx, dy );

      }

      if ( this.rightStick.active && t.identifier === this.rightStick.id ) {

        const dx = t.clientX - this.rightStick.currentX;
        const dy = t.clientY - this.rightStick.currentY;
        this.rightStick.currentX = t.clientX;
        this.rightStick.currentY = t.clientY;

        // Accumulate look like mouse movement
        this.yaw -= dx * LOOK_SPEED_X;
        this.pitch -= dy * LOOK_SPEED_Y;
        this.pitch = Math.max( - Math.PI / 2, Math.min( Math.PI / 2, this.pitch ) );

        const ox = t.clientX - this.rightStick.originX;
        const oy = t.clientY - this.rightStick.originY;
        this.updateKnob( this.rightRing, this.rightKnob, ox, oy );

      }

    }

  }

  private onTouchEnd( e: TouchEvent ): void {

    for ( let i = 0; i < e.changedTouches.length; i ++ ) {

      const t = e.changedTouches[ i ];

      if ( this.leftStick.active && t.identifier === this.leftStick.id ) {

        this.leftStick.active = false;
        this.leftStick.id = null;
        this.runActive = false;
        this.hideStick( this.leftRing, this.leftKnob );

      }

      if ( this.rightStick.active && t.identifier === this.rightStick.id ) {

        this.rightStick.active = false;
        this.rightStick.id = null;
        this.fireDown = false;
        this.hideStick( this.rightRing, this.rightKnob );

      }

    }

  }

  private showStick( ring: HTMLDivElement, _knob: HTMLDivElement, cx: number, cy: number, _dx: number, _dy: number ): void {

    ring.style.left = `${ cx - STICK_RADIUS }px`;
    ring.style.top = `${ cy - STICK_RADIUS }px`;
    ring.style.bottom = 'auto';
    ring.style.right = 'auto';
    ring.style.opacity = '1';

  }

  private hideStick( ring: HTMLDivElement, knob: HTMLDivElement ): void {

    ring.style.opacity = '0';
    // Reset knob to center
    const knobSize = STICK_RADIUS * 0.7;
    const d = STICK_RADIUS * 2;
    knob.style.left = `${ ( d - knobSize ) / 2 }px`;
    knob.style.top = `${ ( d - knobSize ) / 2 }px`;

  }

  private updateKnob( _ring: HTMLDivElement, knob: HTMLDivElement, dx: number, dy: number ): void {

    // Clamp to ring radius
    const dist = Math.sqrt( dx * dx + dy * dy );
    const maxDist = STICK_RADIUS * 0.8;

    if ( dist > maxDist ) {

      dx = dx * maxDist / dist;
      dy = dy * maxDist / dist;

    }

    const knobSize = STICK_RADIUS * 0.7;
    const d = STICK_RADIUS * 2;
    const centerOff = ( d - knobSize ) / 2;
    knob.style.left = `${ centerOff + dx }px`;
    knob.style.top = `${ centerOff + dy }px`;

  }

  update(): void {

    if ( ! this.enabled ) return;

    // Left stick → forward/strafe
    let forward = 0;
    let strafe = 0;

    if ( this.leftStick.active ) {

      const dx = this.leftStick.currentX - this.leftStick.originX;
      const dy = this.leftStick.currentY - this.leftStick.originY;
      const maxDist = STICK_RADIUS * 0.8;

      if ( Math.abs( dx ) > STICK_DEAD ) strafe = Math.max( - 1, Math.min( 1, dx / maxDist ) );
      if ( Math.abs( dy ) > STICK_DEAD ) forward = Math.max( - 1, Math.min( 1, - dy / maxDist ) ); // inverted: up = forward

    }

    // Weapon select
    const weaponSelect = this.weaponSelectPending;
    this.weaponSelectPending = - 1;

    this.world.set( Input, {
      forward,
      strafe,
      vertical: 0,
      yaw: this.yaw,
      pitch: this.pitch,
      jump: false,
      run: this.runActive,
      use: this.useDown,
      attack: this.fireDown,
      weaponSelect
    } );

  }

  dispose(): void {

    this.container.remove();

  }

}
