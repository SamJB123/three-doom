import type { Thing } from '../wad';
export type Skill = 1 | 2 | 3 | 4 | 5;
export const gameRules: {episode:number; map:number; skill:Skill} = {episode:1, map:1, skill:3};

// P_SpawnMapThing: skills 1/2 share bit 1, skill 3 bit 2, skills 4/5 bit 4.
export function shouldSpawnThing(thing: Thing, skill: Skill = gameRules.skill): boolean {
  if (thing.type >= 1 && thing.type <= 4) return true;
  const bit = skill <= 2 ? 1 : skill === 3 ? 2 : 4;
  return !(thing.flags & 16) && !!(thing.flags & bit);
}
