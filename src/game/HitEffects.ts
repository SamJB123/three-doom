import {FRACUNIT} from '../math/fixed';
import {P_Random} from './DoomRandom';
import {spawnMobj,setMobjState} from './Mobj';
/** P_SpawnPuff / P_SpawnBlood. Spawn RNG precedes lifetime RNG and damage. */
export function spawnHitEffect(x:number,y:number,z:number,damage:number,blood:boolean,melee=false) {
  z=(z+((P_Random()-P_Random())<<10))|0;
  const effect=spawnMobj(x,y,z,blood?'MT_BLOOD':'MT_PUFF');
  effect.momz=(blood?2:1)*FRACUNIT;
  effect.tics=Math.max(1,effect.tics-(P_Random()&3));
  if(blood){
    if(damage>=9&&damage<=12)setMobjState(effect,'S_BLOOD2');
    else if(damage<9)setMobjState(effect,'S_BLOOD3');
  }else if(melee)setMobjState(effect,'S_PUFF3');
  return effect;
}
