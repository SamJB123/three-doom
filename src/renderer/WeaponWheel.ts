import type {PlayerStatusState,WeaponSlot} from '../ecs/traits';
const entries:[WeaponSlot,string,number][]=[['fist','Fist',1],['pistol','Pistol',2],['shotgun','Shotgun',3],['chaingun','Chaingun',4],['missile','Rocket',5],['plasma','Plasma',6],['bfg','BFG',7],['chainsaw','Chainsaw',8],['supershotgun','Super shotgun',9]];
/** Input-only presentation: no simulation or weapon state advances here. */
export class WeaponWheel {
  readonly element=document.createElement('div');
  private choices:typeof entries=[];
  private selected=-1;
  private center={x:0,y:0};
  private current:WeaponSlot='pistol';
  constructor(parent:HTMLElement,private select:(slot:number)=>void){
    this.element.id='weapon-wheel';this.element.setAttribute('role','menu');this.element.setAttribute('aria-label','Weapons');
    this.element.style.cssText='position:fixed;width:260px;height:260px;border-radius:50%;background:rgba(15,9,6,.9);border:2px solid #a48c62;box-sizing:border-box;pointer-events:none;color:#ead6a1;';
    parent.append(this.element);this.close();
  }
  get visible():boolean{return !this.element.hidden;}
  open(x:number,y:number,state:PlayerStatusState):void{
    this.choices=entries.filter(([weapon])=>state.weapons[weapon]);this.current=state.currentWeapon;
    this.center={x:Math.max(134,Math.min(innerWidth-134,x)),y:Math.max(134,Math.min(innerHeight-134,y))};
    this.element.style.left=`${this.center.x-130}px`;this.element.style.top=`${this.center.y-130}px`;
    this.element.replaceChildren();this.selected=-1;
    const center=document.createElement('span');center.textContent='WEAPONS\nDrag to select';center.style.cssText='position:absolute;left:85px;top:108px;width:90px;text-align:center;white-space:pre-line;font:bold 11px monospace;';this.element.append(center);
    this.choices.forEach(([weapon,label],index)=>{
      const angle=index/this.choices.length*Math.PI*2-Math.PI/2;
      const item=document.createElement('button');item.type='button';item.textContent=label;item.dataset.weapon=weapon;item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String(weapon===this.current));
      item.style.cssText=`position:absolute;left:${130+Math.cos(angle)*98-31}px;top:${130+Math.sin(angle)*98-19}px;width:62px;height:38px;border:1px solid #75664b;border-radius:8px;background:#201815;color:inherit;font:bold 11px monospace;pointer-events:auto;touch-action:none;`;
      item.addEventListener('click',()=>{this.selected=index;this.finish();});this.element.append(item);
    });
    this.element.hidden=false;
  }
  move(x:number,y:number):void{
    const dx=x-this.center.x,dy=y-this.center.y,distance=Math.hypot(dx,dy);
    this.selected=distance<35||distance>170?-1:Math.round(((Math.atan2(dy,dx)+Math.PI/2+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*this.choices.length)%this.choices.length;
    this.element.querySelectorAll<HTMLButtonElement>('button').forEach((item,index)=>{item.style.background=index===this.selected?'#705123':'#201815';});
  }
  finish():void{
    const choice=this.choices[this.selected];if(choice&&choice[0]!==this.current)this.select(choice[2]);this.close();
  }
  close():void{this.element.hidden=true;this.selected=-1;}
}
