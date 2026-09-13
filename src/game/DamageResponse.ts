import {setMobjState,type Mobj} from './Mobj';
/** Shared P_DamageMobj tail, including living player actors. */
export function wakeAfterDamage(target:Mobj,source:Mobj|null,changeState:(name:string)=>void=name=>{setMobjState(target,name);}):void {
  target.reactionTime = 0; // wake up immediately

  // Infighting: switch target to attacker (with threshold check)
  if ( ( ! target.threshold || target.type === 'MT_VILE' ) &&
       source && source !== target && source.type !== 'MT_VILE' ) {

    target.target = source;
    target.threshold = 100;

    // If in spawn (idle) state, switch to see state
    if ( target.state === target.info.spawnState && target.info.seeState ) {

      changeState(target.info.seeState);

    }

  }

}

