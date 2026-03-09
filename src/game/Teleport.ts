// Doom teleporter system — ported from p_telept.c / p_spec.c EV_Teleport.
// Moves a thing to the teleport destination in the tagged sector.

import type { DoomMapData, DoomPlayer } from '../physics/DoomMovement';
import type { Linedef, Thing } from '../wad';
import { intToFixed } from '../math/fixed';
import { playSound } from '../sound';

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
  player: DoomPlayer,
  map: DoomMapData,
  things: Thing[]
): boolean {

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
      const thingSectorIdx = findSectorAtInt( thing.x, thing.y, map );
      if ( thingSectorIdx !== si ) continue;

      // Found the destination — teleport the player
      const destX = intToFixed( thing.x );
      const destY = intToFixed( thing.y );
      const destFloorZ = intToFixed( map.sectors[ si ].floorHeight );

      // Set player position
      player.mo.x = destX;
      player.mo.y = destY;
      player.mo.z = destFloorZ;
      player.mo.floorz = destFloorZ;

      // Zero momentum
      player.mo.momx = 0;
      player.mo.momy = 0;

      // Update viewz
      player.viewz = destFloorZ + player.viewheight;

      // Store teleport angle for camera sync and set reaction time
      pendingTeleportAngle = thing.angle;
      pendingTeleportReaction = 18;

      // Play teleport sound
      playSound( 'telept' );

      // TODO: spawn MT_TFOG at old and new positions once mobj spawning is wired

      return true;

    }

  }

  return false;

}

// ============================================================
// Simple BSP point-in-sector lookup (integer coords)
// ============================================================

function findSectorAtInt( x: number, y: number, map: DoomMapData ): number {

  if ( map.nodes.length === 0 ) {

    // Degenerate map — single subsector
    if ( map.subsectors.length > 0 ) {

      const seg = map.segs[ map.subsectors[ 0 ].firstSeg ];
      if ( seg ) {

        const ld = map.linedefs[ seg.linedef ];
        return map.sidedefs[ ld.right ].sector;

      }

    }
    return 0;

  }

  let nodeIdx = map.nodes.length - 1;

  while ( ! ( nodeIdx & 0x8000 ) ) {

    const node = map.nodes[ nodeIdx ];
    const dx = x - node.x;
    const dy = y - node.y;

    // Which side of the partition line?
    const side = ( dy * node.dx - dx * node.dy ) > 0 ? 1 : 0;
    nodeIdx = side === 0 ? node.rightChild : node.leftChild;

  }

  // Leaf — subsector
  const subIdx = nodeIdx & 0x7FFF;
  const sub = map.subsectors[ subIdx ];
  if ( ! sub ) return 0;

  const seg = map.segs[ sub.firstSeg ];
  if ( ! seg ) return 0;

  const ld = map.linedefs[ seg.linedef ];
  return map.sidedefs[ ld.right ].sector;

}
