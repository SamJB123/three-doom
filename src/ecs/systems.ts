import type { World } from 'koota';
import { Time, Input, DoomWorld, Camera, IsPlayer, Position, PlayerStatus } from './traits';
import { movePlayer, xyMovement, zMovement, calcHeight } from '../physics/DoomMovement';
import { fixedToFloat, FRACUNIT } from '../math/fixed';
import { runThinkers } from '../game/Thinkers';
import { handleUseInput, updateButtons } from '../game/UseAction';
import { playerInSpecialSector } from '../game/PlayerDamage';
import { MF_NOCLIP, MF_SHADOW } from '../game/MobjData';
import { tickPlayerMobjState } from '../game/PlayerState';

const SCALE = 1.0 / 32.0;

// Exactly one simulation tic. Scheduling belongs to TicClock in main.ts.
export function playerTickSystem( world: World, tickWeapons:()=>void=()=>{} ): void {

  const time = world.get( Time );
  const input = world.get( Input );
  const doomRef = world.get( DoomWorld );

  if ( ! time || ! input || ! doomRef?.player || ! doomRef.map ) return;

  const { player, map } = doomRef;

  // Sync run state from input
  player.running = input.run;

  const pState = world.get( PlayerStatus );

  if ( pState ) {
    player.mo.flags = pState.noClip ? player.mo.flags | MF_NOCLIP : player.mo.flags & ~MF_NOCLIP;
    player.mo.flags = pState.powers.invisibility ? player.mo.flags | MF_SHADOW : player.mo.flags & ~MF_SHADOW;
  }
  const isDead = pState && pState.playerState === 'PST_DEAD';

  if ( isDead ) {

    tickWeapons();
    if(input.use)pState.playerState='PST_REBORN';

    // Sink view toward floor (P_DeathThink)
    if ( player.viewheight > 6 * FRACUNIT ) {

      player.viewheight -= FRACUNIT;

    }

    if ( pState!.damageCount > 0 ) pState!.damageCount --;

    runThinkers();
    updateButtons(map.sidedefs);
    for(const line of map.linedefs)if(line.special===48)map.sidedefs[line.right].xoff++;
    time.levelTime += 1;
    player.viewz = player.mo.z + player.viewheight;
    syncPlayerPositionSystem( world );
    return;

  }

  // Convert Three.js yaw → Doom angle
  const doomAngle = input.yaw + Math.PI / 2;
  player.mo.angle = doomAngle;

  // Apply input thrust
  if (player.mo.reactionTime > 0) player.mo.reactionTime--;
  else movePlayer( player, input.forward, input.strafe, doomAngle );

  // P_PlayerThink performs view/special/use/weapon work before P_RunThinkers.
  calcHeight(player,time.levelTime);
  if(pState){playerInSpecialSector(player,pState,map,time.levelTime);if(pState.playerState==='PST_LIVE')player.mo.health=pState.health;}
  handleUseInput(input.use,player,doomAngle,map,pState);
  tickWeapons();

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

    if(!pState.powers.invisibility)player.mo.flags &= ~MF_SHADOW;

  }

  runThinkers();
  updateButtons(map.sidedefs);
  for(const line of map.linedefs)if(line.special===48)map.sidedefs[line.right].xoff++;
  time.levelTime += 1;
  syncPlayerPositionSystem( world );
}

// The player's physical actor now occupies its normal slot in P_RunThinkers.
export function playerMobjTickSystem(world:World):void {
  const reference=world.get(DoomWorld),state=world.get(PlayerStatus);
  if(!reference?.player || !reference.map)return;
  xyMovement(reference.player.mo,reference.map);
  zMovement(reference.player.mo,reference.player);
  if(state)tickPlayerMobjState(state,reference.player.mo);
}

export function syncPlayerPositionSystem( world: World ): void {
  const player = world.get( DoomWorld )?.player;
  if ( ! player ) return;

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
