// Structured equivalent of p_saveg.c's player/world/thinker/special archives.
// Actor links are stable indices; renderer objects and callback functions stay out.
import type { DoomMapData, DoomPlayer } from '../physics/DoomMovement';
import { archiveThinkers, resetThinkers, type ThinkerRecord } from './Thinkers';
import { archiveMobjs, restoreMobjs, restoreMobjThinker, allMobjs } from './Mobj';
import { archiveRandom, restoreRandom } from './DoomRandom';
import { archiveEnemyAI, restoreEnemyAI } from './EnemyAI';
import { archiveUseActions, restoreUseActions } from './UseAction';
import { restoreDoors, resetDoors, type VDoor } from './Doors';
import { restoreFloors, resetFloors, type FloorMove } from './Floors';
import { restorePlatforms, resetPlatforms, type Plat } from './Platforms';
import { restoreStairs, resetStairs, type StairMove } from './Stairs';
import { restoreCeilings, resetCeilings, type CeilingMove } from './Ceilings';
import { restoreLights, type LightState } from './Lights';

export function archiveWorld(map: DoomMapData, player: DoomPlayer) {
  const {mo,...body}=player;
  return structuredClone({
    sectors:map.sectors, sides:map.sidedefs, lines:map.linedefs, player:body,
    actors:archiveMobjs(),thinkers:archiveThinkers(),random:archiveRandom(),
    ai:archiveEnemyAI(),use:archiveUseActions(map.sidedefs)
  });
}
export type WorldArchive=ReturnType<typeof archiveWorld>;
export const THINKER_KINDS=new Set(['mobj','door','floor','platform','stair','ceiling','light']);

function restoreThinker(record: ThinkerRecord, map: DoomMapData): void {
  switch(record.kind) {
    case 'mobj':restoreMobjThinker(allMobjs[record.data as number]);break;
    case 'door':restoreDoors(record.data as VDoor,map.sectors);break;
    case 'floor':restoreFloors(record.data as FloorMove,map.sectors);break;
    case 'platform':restorePlatforms(record.data as Plat,map.sectors);break;
    case 'stair':restoreStairs(record.data as StairMove,map.sectors);break;
    case 'ceiling':restoreCeilings(record.data as CeilingMove,map.sectors);break;
    case 'light':restoreLights(record.data as LightState,map.sectors);break;
    default:throw new Error('Unknown saved thinker: '+record.kind);
  }
}
export function restoreWorld(map: DoomMapData, player: DoomPlayer, saved: WorldArchive): void {
  const state=structuredClone(saved);
  state.sectors.forEach((value,i)=>Object.assign(map.sectors[i],value));
  state.sides.forEach((value,i)=>Object.assign(map.sidedefs[i],value));
  state.lines.forEach((value,i)=>Object.assign(map.linedefs[i],value));
  Object.assign(player,state.player);
  restoreMobjs(state.actors,player.mo);
  resetThinkers();resetDoors();resetFloors();resetPlatforms();resetStairs();resetCeilings();
  state.thinkers.forEach(record=>restoreThinker(record,map));
  restoreUseActions(state.use,map.sidedefs);restoreEnemyAI(state.ai);restoreRandom(state.random);
}
