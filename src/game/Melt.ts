import {M_Random} from './DoomRandom';
/** f_wipe.c wipe_initMelt/wipe_doMelt, in the original 320×200 screen grid. */
export class Melt {
  readonly columns:number[];
  done=false;
  constructor(readonly width=320,readonly height=200,random:()=>number=M_Random){
    // Source initializes width entries although each active column is 2 pixels.
    this.columns=[-(random()%16)|0];
    for(let i=1;i<width;i++){
      let y=this.columns[i-1]+random()%3-1;
      if(y>0)y=0;else if(y===-16)y=-15;
      this.columns.push(y);
    }
  }
  tick():boolean {
    this.done=true;
    for(let i=0;i<this.width/2;i++){
      const y=this.columns[i];
      if(y<0){this.columns[i]++;this.done=false;}
      else if(y<this.height){this.columns[i]=Math.min(this.height,y+(y<16?y+1:8));this.done=false;}
    }
    return this.done;
  }
}
