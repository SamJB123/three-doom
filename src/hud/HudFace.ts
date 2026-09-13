import type {PlayerStatusState,WeaponSlot} from '../ecs/traits';
import type {Mobj} from '../game/Mobj';
import {M_Random} from '../game/DoomRandom';
import {pointToAngle,radiansToAngle} from '../math/angles';

/** ST_updateFaceWidget / ST_Ticker. Called once per simulation tic. */
export class HudFace {
  index=0;
  private count=0;
  private priority=0;
  private attackDelay=-1;
  private oldHealth=100;
  private oldWeapons={} as Record<WeaponSlot,boolean>;
  reset(state:PlayerStatusState):void {
    this.index=0;this.count=0;this.priority=0;this.attackDelay=-1;
    this.oldHealth=state.health;this.oldWeapons={...state.weapons};
  }
  tick(state:PlayerStatusState,attacking:boolean,actor?:Mobj,random=M_Random()):number {
    const pain=Math.floor((100-Math.min(100,Math.max(0,state.health)))*5/101)*8;
    if(this.priority<10&&state.health<=0){this.priority=9;this.index=41;this.count=1;}
    if(this.priority<9&&state.bonusCount){
      let changed=false;
      for(const weapon of Object.keys(state.weapons) as WeaponSlot[]){
        if(this.oldWeapons[weapon]!==state.weapons[weapon])changed=true;
        this.oldWeapons[weapon]=state.weapons[weapon];
      }
      if(changed){this.priority=8;this.index=pain+6;this.count=70;}
    }
    const attacker=actor?.lastAttacker;
    // Preserve the supplied ST_updateFaceWidget health-difference sign,
    // including its well-known rarely-seen ouch face behavior.
    const ouch=state.health-this.oldHealth>20;
    if(this.priority<8&&state.damageCount&&attacker&&attacker!==actor){
      this.priority=7;this.count=35;
      if(ouch)this.index=pain+5;
      else{
        const badguy=pointToAngle(attacker.x-actor!.x,attacker.y-actor!.y),facing=radiansToAngle(actor!.angle);
        const diff=Math.abs(badguy-facing);
        const right=badguy>facing?diff>0x80000000:diff<=0x80000000;
        this.index=pain+(diff<0x20000000?7:right?3:4);
      }
    }
    if(this.priority<7&&state.damageCount){this.priority=ouch?7:6;this.count=35;this.index=pain+(ouch?5:7);}
    if(this.priority<6){
      if(attacking){
        if(this.attackDelay===-1)this.attackDelay=70;
        else if(--this.attackDelay===0){this.priority=5;this.index=pain+7;this.count=1;this.attackDelay=1;}
      }else this.attackDelay=-1;
    }
    if(this.priority<5&&(state.godMode||state.powers.invulnerability)){this.priority=4;this.index=40;this.count=1;}
    if(this.count===0){this.index=pain+random%3;this.count=17;this.priority=0;}
    this.count--;this.oldHealth=state.health;
    return this.index;
  }
}
