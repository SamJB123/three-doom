import {linkThing} from '../physics/ThingLinks';
import {fineSin,fineCos} from '../math/angles';
// Doom teleporter system — ported from p_telept.c / p_spec.c EV_Teleport.
// Moves a thing to the teleport destination in the tagged sector.

import { findSectorAt, type DoomMapData, type DoomPlayer } from '../physics/DoomMovement';
import type { Linedef, Thing } from '../wad';
import { intToFixed } from '../math/fixed';
import { playSoundAt } from '../sound';
import { allMobjs, spawnMobj, type Mobj } from './Mobj';
import { damageMobj } from './Attack';
import { MF_SHOOTABLE, MF_MISSILE } from './MobjData';

const TELEPORT_DOOMEDNUM = 14; // Teleport destination thing type

// Pending teleport info — consumed by main loop to sync camera
let pendingTeleportAngle: number | null = null;
let pendingTeleportReaction = 0;

/**
 * Check and consume a pending teleport. Returns the destination angle
 * (in degrees, as stored in the WAD thing) if a teleport just happened,
 * or null if no teleport is pending.
 */
export function consumeTeleport(): { angle: number; reactionTime: number } | null {

  if ( pendingTeleportAngle === null ) return null;

  const result = { angle: pendingTeleportAngle, reactionTime: pendingTeleportReaction };
  pendingTeleportAngle = null;
  pendingTeleportReaction = 0;
  return result;

}

/**
 * EV_Teleport — teleport the player to the destination thing in the tagged sector.
 * Called from walk-over line triggers (types 39, 97, etc.)
 */
export function evTeleport(
  line: Linedef,
  side: number,
  actor: DoomPlayer | Mobj,
  map: DoomMapData,
  things: Thing[]
): boolean {

  const player = 'mo' in actor ? actor : null;
  const mover = player ? player.mo : actor as Mobj;
  if(mover.flags & MF_MISSILE)return false;
  // Don't teleport from the back side
  if ( side === 1 ) return false;

  const tag = line.tag;

  // Find the teleport destination thing (type 14) in the tagged sector
  for ( let si = 0; si < map.sectors.length; si ++ ) {

    if ( map.sectors[ si ].tag !== tag ) continue;

    // Find a teleport destination thing in this sector
    for ( const thing of things ) {

      if ( thing.type !== TELEPORT_DOOMEDNUM ) continue;

      // Check if this thing is in the target sector — use the BSP to find
      // which sector the thing position falls in
      const thingSectorIdx = map.sectors.indexOf(findSectorAt(thing.x, thing.y, map)!);
      if ( thingSectorIdx !== si ) continue;

      // Found the destination — teleport the player
      const destX = intToFixed( thing.x );
      const destY = intToFixed( thing.y );
      const destFloorZ = intToFixed( map.sectors[ si ].floorHeight );

      const old = {x:mover.x,y:mover.y,z:mover.z};
      // PIT_StompThing: player telefrags shootable occupants regardless of height.
      for (const mo of [...allMobjs]) {
        if (mo === mover || !(mo.flags & MF_SHOOTABLE)) continue;
        const radius = mo.radius + mover.radius;
        if (Math.abs(mo.x-destX) < radius && Math.abs(mo.y-destY) < radius) {
          if(!player)return false; // Ultimate Doom monsters cannot telefrag.
          damageMobj(mo, mover, mover, 10000);
        }
      }
      // Set player position
      mover.x = destX;
      mover.y = destY;
      linkThing(mover,map);
      mover.z = destFloorZ;
      mover.floorz = destFloorZ;
      mover.ceilingz = intToFixed(map.sectors[si].ceilingHeight);
      mover.sectorIndex = si;
      mover.angle = Math.floor(thing.angle / 45) * Math.PI / 4;
      if(player)mover.reactionTime = 18;
      mover.momz = 0;

      // Zero momentum
      mover.momx = 0;
      mover.momy = 0;

      // Update viewz
      if(player)player.viewz = destFloorZ + player.viewheight;

      // Store teleport angle for camera sync and set reaction time
      if(player){pendingTeleportAngle = Math.floor(thing.angle / 45) * 45;pendingTeleportReaction = 18;}

      const oldFog=spawnMobj(old.x,old.y,old.z,'MT_TFOG');
      playSoundAt('telept',old.x,old.y,old.z,oldFog);
      const fogX = destX + 20 * fineCos(mover.angle);
      const fogY = destY + 20 * fineSin(mover.angle);
      const newFog=spawnMobj(fogX,fogY,destFloorZ,'MT_TFOG');
      playSoundAt('telept',fogX,fogY,destFloorZ,newFog);

      return true;

    }

  }

  return false;

}
