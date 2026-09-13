import type {Thing} from '../wad';
import {spawnMapThing} from './Mobj';
import {archiveRandom,restoreRandom} from './DoomRandom';
import {MOBJ_STATES} from './MobjData';
// Version 1 stored pickups/decorations as surviving sprite indices. Version 2
// stores them as normal actors. Rebuild only survivors, never collected items.
export function migrateLegacyMapActors(saved:{sprites:{index:number;frame:number;tics:number}[]},things:Thing[]):void {
  const random=archiveRandom();
  for(const record of saved.sprites){
    const thing=things[record.index];if(!thing)continue;
    const actor=spawnMapThing(thing);if(!actor)continue;
    // Keep the old animation phase where the source loop has matching frames.
    for(let i=0;i<record.frame;i++){
      const next=actor.state && MOBJ_STATES[actor.state]?.next;
      if(!next || next==='S_NULL')break;actor.state=next;
    }
    const duration=actor.state?MOBJ_STATES[actor.state]?.tics:-1;
    actor.tics=duration && duration>0?Math.max(1,duration-record.tics):duration??-1;
  }
  for(const thing of things)if(thing.type===14)spawnMapThing(thing);
  restoreRandom(random);
}
