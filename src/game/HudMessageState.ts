// Single-player HU_Ticker message timeout and HU_MSGREFRESH behavior.
export class HudMessageState {
  text=''; remaining=0; enabled=true;
  private pending:string|null=null;
  post(text:string):void {this.pending=text;}
  tick():void {
    if(this.remaining>0)this.remaining--;
    if(this.enabled && this.pending!==null){this.text=this.pending;this.pending=null;this.remaining=4*35;}
  }
  refresh():void {if(this.text)this.remaining=4*35;}
  reset():void {this.text='';this.remaining=0;this.pending=null;}
}
