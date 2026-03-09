import type { World } from 'koota';
import { Time, Input, DoomWorld, Camera, IsPlayer, Position, PlayerStatus } from './traits';
import { movePlayer, xyMovement, zMovement, calcHeight } from '../physics/DoomMovement';
import { fixedToFloat, FRACUNIT } from '../math/fixed';
import { runThinkers } from '../game/Thinkers';
import { handleUseInput, updateButtons } from '../game/UseAction';
import { playerInSpecialSector } from '../game/PlayerDamage';
import { tickPlayerMobjState } from '../game/PlayerState';

const SCALE = 1.0 / 32.0;

// Doom runs at 35 tics/sec
const TIC_DURATION = 1.0 / 35.0;

let ticAccumulator = 0;

// System: apply input to Doom movement, run physics and thinkers
export function playerMovementSystem( world: World ): void {

  const time = world.get( Time );
  const input = world.get( Input );
  const doomRef = world.get( DoomWorld );

  if ( ! time || ! input || ! doomRef?.player || ! doomRef.map ) return;

  const { player, map } = doomRef;

  // Sync run state from input
  player.running = input.run;

  // Accumulate time across frames and run fixed tics
  ticAccumulator += time.delta;
  const ticsToRun = Math.min( Math.floor( ticAccumulator / TIC_DURATION ), 4 );
  ticAccumulator -= ticsToRun * TIC_DURATION;

  const pState = world.get( PlayerStatus );

  for ( let i = 0; i < ticsToRun; i ++ ) {

    const isDead = pState && pState.playerState === 'PST_DEAD';

    if ( isDead ) {

      // Still run thinkers so doors/crushers keep moving
      runThinkers();
      updateButtons( map.sidedefs );

      // Tick player mobj state (death animation)
      tickPlayerMobjState( pState! );

      // Sink view toward floor (P_DeathThink)
      if ( player.viewheight > 6 * FRACUNIT ) {

        player.viewheight -= FRACUNIT;

      }

      if ( pState!.damageCount > 0 ) pState!.damageCount --;

      time.levelTime += 1;
      continue;

    }

    // Convert Three.js yaw → Doom angle
    const doomAngle = input.yaw + Math.PI / 2;

    // Handle use input
    handleUseInput( input.use, player, doomAngle, map );

    // Apply input thrust
    movePlayer( player, input.forward, input.strafe, doomAngle );

    // Run movement
    xyMovement( player.mo, map );
    zMovement( player.mo, player );

    // Run all active thinkers (doors, platforms, floors)
    runThinkers();

    // Update button timers
    updateButtons( map.sidedefs );

    // Tick down powers and bonusCount
    if ( pState ) {

      // Strength counts UP to diminish fade (p_user.c)
      if ( pState.powers.strength ) pState.powers.strength ++;

      // All other powers count down
      if ( pState.powers.invulnerability > 0 ) pState.powers.invulnerability --;
      if ( pState.powers.invisibility > 0 ) pState.powers.invisibility --;
      if ( pState.powers.ironfeet > 0 ) pState.powers.ironfeet --;
      if ( pState.powers.infrared > 0 ) pState.powers.infrared --;
      // allmap stays at 1 forever once acquired (no decrement)

      if ( pState.bonusCount > 0 ) pState.bonusCount --;
      if ( pState.damageCount > 0 ) pState.damageCount --;

      // Tick player mobj state machine (pain, death, etc.)
      tickPlayerMobjState( pState );

    }

    // Check for damaging floors
    if ( pState ) {

      playerInSpecialSector( player, pState, map, time.levelTime );
      player.mo.health = pState.health;

    }

    // Update level time for bob calculation
    time.levelTime += 1;

  }

  // Calculate view height (runs every frame for smooth bob)
  calcHeight( player, time.levelTime );

  // Sync Doom position → ECS position
  world.query( IsPlayer, Position ).updateEach( ( [ position ] ) => {

    position.x = fixedToFloat( player.mo.x ) * SCALE;
    position.y = fixedToFloat( player.viewz ) * SCALE;
    position.z = - fixedToFloat( player.mo.y ) * SCALE;

  } );

}

// System: sync camera to player position + rotation
export function cameraSystem( world: World ): void {

  const cameraRef = world.get( Camera );
  const input = world.get( Input );

  if ( ! cameraRef?.camera || ! input ) return;

  const cam = cameraRef.camera;

  world.query( IsPlayer, Position ).readEach( ( [ position ] ) => {

    cam.position.set( position.x, position.y, position.z );

  } );

  cam.rotation.order = 'YXZ';
  cam.rotation.y = input.yaw;
  cam.rotation.x = input.pitch;

}
