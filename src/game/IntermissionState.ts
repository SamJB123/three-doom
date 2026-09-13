// wi_stuff.c single-player StatCount -> ShowNextLoc -> NoState sequence.
export interface IntermissionStats {
  episode:number;map:number;next:number;kills:number;totalKills:number;items:number;totalItems:number;
  secrets:number;totalSecrets:number;time:number;didSecret?:boolean;
}
const PARS=[[30,75,120,90,165,180,180,30,165],[90,90,90,120,90,360,240,30,170],[90,45,90,150,90,90,165,30,135]];
export class IntermissionState {
  phase:'stats'|'next'|'leaving'|'done'='stats';
  stage=1;tic=0;pause=35;remaining=0;accelerate=false;
  counts=[-1,-1,-1,-1,-1];
  readonly totals:number[];
  constructor(readonly stats:IntermissionStats) {
    this.totals=[Math.trunc(stats.kills*100/Math.max(1,stats.totalKills)),Math.trunc(stats.items*100/Math.max(1,stats.totalItems)),
      Math.trunc(stats.secrets*100/Math.max(1,stats.totalSecrets)),stats.time,PARS[stats.episode-1]?.[stats.map-1]??0];
  }
  advance():void {this.accelerate=true;}
  tick():string[] {
    this.tic++;const sounds:string[]=[];
    if(this.phase==='done')return sounds;
    if(this.phase==='leaving'){if(--this.remaining===0)this.phase='done';return sounds;}
    if(this.phase==='next') {
      if(--this.remaining===0||this.accelerate){this.phase='leaving';this.remaining=10;this.accelerate=false;}
      return sounds;
    }
    if(this.accelerate && this.stage!==10){this.accelerate=false;this.counts=[...this.totals];this.stage=10;sounds.push('barexp');}
    if([2,4,6].includes(this.stage)) {
      const i=this.stage/2-1;this.counts[i]+=2;
      if(!(this.tic&3))sounds.push('pistol');
      if(this.counts[i]>=this.totals[i]){this.counts[i]=this.totals[i];sounds.push('barexp');this.stage++;}
    } else if(this.stage===8) {
      if(!(this.tic&3))sounds.push('pistol');
      for(const i of [3,4])this.counts[i]=Math.min(this.totals[i],this.counts[i]+3);
      if(this.counts[3]===this.totals[3]&&this.counts[4]===this.totals[4]){sounds.push('barexp');this.stage++;}
    } else if(this.stage===10) {
      if(this.accelerate){this.accelerate=false;this.phase='next';this.remaining=140;sounds.push('sgcock');}
    } else if(this.stage&1) {
      if(--this.pause===0){this.stage++;this.pause=35;}
    }
    return sounds;
  }
  get pointer():boolean {return this.phase==='leaving'||(this.remaining&31)<20;}
  get label():string {return this.phase==='stats'?(this.stage===10?`Continue to E${this.stats.episode}M${this.stats.next}`:'Show totals'):`Enter E${this.stats.episode}M${this.stats.next}`;}
}
