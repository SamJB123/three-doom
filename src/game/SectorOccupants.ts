import type { DoomMapData } from '../physics/DoomMovement';
import { clipThingHeight, findSectorAtFixed } from '../physics/DoomMovement';
import { getLinedefsInBounds } from '../wad/BlockmapParser';
import type { Sector } from '../wad';
import { FRACUNIT } from '../math/fixed';
import { MF_CORPSE, MF_DROPPED, MF_SHOOTABLE, MF_SOLID } from './MobjData';
import { removeMobj } from './Mobj';
import { damageMobj } from './Attack';

// p_map.c P_ChangeSector / PIT_ChangeSector. Spatial candidates include actors
// straddling a sector boundary, not just those whose centre is inside it.
export function sectorChangeHandler(map: DoomMapData, getTic: () => number) {
  return (sector: Sector, crush: boolean): boolean => {
    const index = map.sectors.indexOf(sector);
    let blocked = false;
    for (const mo of [...(map.mobjs ?? [])]) {
      if (mo.removed) continue;
      let touches = findSectorAtFixed(mo.x, mo.y, map) === sector;
      if (!touches) {
        const lines = getLinedefsInBounds(map.blockmap,
          (mo.x - mo.radius) / FRACUNIT, (mo.y - mo.radius) / FRACUNIT,
          (mo.x + mo.radius) / FRACUNIT, (mo.y + mo.radius) / FRACUNIT);
        for (const idx of lines) {
          const line = map.linedefs[idx];
          if (map.sidedefs[line.right]?.sector !== index && map.sidedefs[line.left]?.sector !== index) continue;
          const a = map.vertexes[line.v1], b = map.vertexes[line.v2];
          const x = mo.x / FRACUNIT, y = mo.y / FRACUNIT, r = mo.radius / FRACUNIT;
          if (x + r >= Math.min(a.x,b.x) && x - r <= Math.max(a.x,b.x) &&
              y + r >= Math.min(a.y,b.y) && y - r <= Math.max(a.y,b.y)) touches = true;
        }
      }
      if (!touches || clipThingHeight(mo, map)) continue;
      if (mo.health <= 0 || (mo.flags & MF_CORPSE)) {
        mo.flags &= ~MF_SOLID; mo.height = mo.radius = 0;
      } else if (mo.flags & MF_DROPPED) removeMobj(mo);
      else if (mo.flags & MF_SHOOTABLE) {
        blocked = true;
        if (crush && !(getTic() & 3)) damageMobj(mo, null, null, 10);
      }
    }
    return blocked;
  };
}
