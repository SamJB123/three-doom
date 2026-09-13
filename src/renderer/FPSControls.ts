import type { World } from 'koota';
import { Input } from '../ecs/traits';

export class FPSControls {

  lookSpeed = 0.002;
  private enabled = false;

  private keys: Record<string, boolean> = {};
  private mouseDown = false;
  private locked = false;
  private yaw = 0;
  private pitch = 0;

  constructor( private domElement: HTMLElement, private world: World ) {

    domElement.addEventListener( 'click', () => {

      if ( this.enabled && ! this.locked ) domElement.requestPointerLock()?.catch( () => {} );

    } );

    document.addEventListener( 'mousedown', ( e: MouseEvent ) => {

      if ( this.enabled && this.locked && e.button === 0 ) this.mouseDown = true;

    } );
    document.addEventListener( 'mouseup', ( e: MouseEvent ) => {

      if ( e.button === 0 ) this.mouseDown = false;

    } );

    document.addEventListener( 'pointerlockchange', () => {

      this.locked = document.pointerLockElement === domElement;

    } );

    document.addEventListener( 'mousemove', ( e: MouseEvent ) => {

      if ( ! this.enabled || ! this.locked ) return;
      this.yaw -= e.movementX * this.lookSpeed;
      this.pitch -= e.movementY * this.lookSpeed;
      this.pitch = Math.max( - Math.PI / 2, Math.min( Math.PI / 2, this.pitch ) );

    } );

    document.addEventListener( 'keydown', ( e: KeyboardEvent ) => { if ( this.enabled ) this.keys[ e.code ] = true; } );
    document.addEventListener( 'keyup', ( e: KeyboardEvent ) => { this.keys[ e.code ] = false; } );

  }

  setEnabled( enabled: boolean ): void {
    this.enabled = enabled;
    this.keys = {};
    this.mouseDown = false;
    this.world.set( Input, { forward: 0, strafe: 0, vertical: 0, jump: false,
      run: false, use: false, attack: false, weaponSelect: -1,
      yaw: this.yaw, pitch: this.pitch } );
  }

  setInitialYaw( yaw: number, pitch = 0 ): void {
    this.pitch = pitch;

    this.yaw = yaw;

  }

  update(): void {

    if ( ! this.enabled ) return;

    let forward = 0;
    let strafe = 0;
    let vertical = 0;

    if ( this.keys[ 'KeyW' ] || this.keys[ 'ArrowUp' ] ) forward = 1;
    if ( this.keys[ 'KeyS' ] || this.keys[ 'ArrowDown' ] ) forward = - 1;
    if ( this.keys[ 'KeyA' ] || this.keys[ 'ArrowLeft' ] ) strafe = - 1;
    if ( this.keys[ 'KeyD' ] || this.keys[ 'ArrowRight' ] ) strafe = 1;
    if ( this.keys[ 'KeyQ' ] ) vertical = - 1;
    if ( this.keys[ 'KeyE' ] ) vertical = 1;

    const jump = this.keys[ 'Space' ] || false;
    const run = this.keys[ 'ShiftLeft' ] || this.keys[ 'ShiftRight' ] || false;
    const use = this.keys[ 'KeyE' ] || this.keys[ 'KeyF' ] || false;
    const attack = this.mouseDown || this.keys[ 'ControlLeft' ] || this.keys[ 'ControlRight' ] || false;

    // Weapon select: 1 = fist/chainsaw, 2-7 = pistol through BFG (original Doom)
    let weaponSelect = - 1;
    const weaponKeys = [ 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7' ];

    for ( let i = 0; i < weaponKeys.length; i ++ ) {

      if ( this.keys[ weaponKeys[ i ] ] ) { weaponSelect = i + 1; break; }

    }

    this.world.set( Input, {
      forward,
      strafe,
      vertical,
      yaw: this.yaw,
      pitch: this.pitch,
      jump,
      run,
      use,
      attack,
      weaponSelect
    } );

  }

}
