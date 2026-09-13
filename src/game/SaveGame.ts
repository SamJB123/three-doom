import type {WorldArchive} from './WorldArchive';
import {THINKER_KINDS} from './WorldArchive';
import {MOBJ_TYPES,MOBJ_STATES} from './MobjData';
import {createPlayerStatus, type PlayerStatusState} from '../ecs/traits';
import type {WeaponSystem} from './Weapons';
import type {archiveStaticSprites} from '../renderer/SpriteRenderer';
import type {Automap} from '../hud/Automap';
import type {Skill} from './GameRules';

export interface SaveGame {
  format: 'three-doom'; version: 1 | 2; wad: string; label: string; savedAt: string;
  episode: number; map: number; skill: Skill; tic: number;
  world: WorldArchive; player: PlayerStatusState; weapons: ReturnType<WeaponSystem['archive']>;
  sprites: ReturnType<typeof archiveStaticSprites>; automap: ReturnType<Automap['archive']>;
  view: {yaw:number;pitch:number}; stats: {kills:number;items:number;secrets:number};
}
export const SAVE_PREFIX='three-doom.save.v1.';
export const SAVE_SLOTS=6;
const integer=(value:unknown,min:number,max:number):value is number=>Number.isInteger(value)&&Number(value)>=min&&Number(value)<=max;
function invalid():never {throw new Error('This save is damaged or incompatible.');}
export function decodeSave(text:string,wad:string): SaveGame {
  if(text.length>8_000_000)invalid();
  let save:SaveGame;
  try {save=JSON.parse(text);} catch {return invalid();}
  if(!save || save.format!=='three-doom'||(save.version!==1 && save.version!==2))invalid();
  if(save.wad!==wad)throw new Error('This save belongs to a different WAD.');
  if(!integer(save.episode,1,4)||!integer(save.map,1,9)||!integer(save.skill,1,5)||!integer(save.tic,0,0x7fffffff))invalid();
  const w=save.world;
  if(!w || !Array.isArray(w.actors)||!Array.isArray(w.thinkers)||!Array.isArray(w.sectors)||!Array.isArray(w.sides)||!Array.isArray(w.lines))invalid();
  if(w.actors.length>100000 || w.actors.filter(m=>m.type==='MT_PLAYER').length!==1)invalid();
  if(w.thingLinkSequence!==undefined&&!integer(w.thingLinkSequence,0,Number.MAX_SAFE_INTEGER))invalid();
  for(const actor of w.actors) {
    if(actor.lastAttacker!==undefined&&!integer(actor.lastAttacker,-1,w.actors.length-1))invalid();
    if(actor.blockOrder!==undefined&&!integer(actor.blockOrder,0,w.thingLinkSequence??Number.MAX_SAFE_INTEGER))invalid();
    if(!MOBJ_TYPES[actor.type] || (actor.state!==null && !MOBJ_STATES[actor.state]))invalid();
    for(const key of ['x','y','z','momx','momy','momz','radius','height','floorz','ceilingz','angle','health','tics','flags'] as const)if(!Number.isFinite(actor[key]))invalid();
    if(!integer(actor.target,-1,w.actors.length-1)||!integer(actor.tracer,-1,w.actors.length-1))invalid();
  }
  for(const record of w.thinkers) {
    if(!THINKER_KINDS.has(record.kind))invalid();
    if(record.kind==='mobj') {if(!integer(record.data,0,w.actors.length-1))invalid();}
    else {
      const data=record.data as {sectorIdx:number};
      if(!data||!integer(data.sectorIdx,0,w.sectors.length-1))invalid();
    }
  }
  if(!w.random || !integer(w.random.play,0,255)||!integer(w.random.misc,0,255)||!w.ai||!Array.isArray(w.ai.sounds)||!w.use||!Array.isArray(w.use.buttons))invalid();
  if(!save.player?.ammo||!save.player?.powers||!save.weapons?.psprites||save.weapons.psprites.length!==2||!save.sprites?.sprites||!save.automap?.seen||!save.view||!save.stats)invalid();
  // Reject non-finite/null numeric world fields before replacing the live level.
  for(const sector of w.sectors)for(const key of ['floorHeight','ceilingHeight','lightLevel','special','tag'] as const)if(!Number.isFinite(sector[key]))invalid();
  for(const line of w.lines)if(!integer(line.right,0,w.sides.length-1)||!integer(line.left,-1,w.sides.length-1))invalid();
  for(const side of w.sides)if(!integer(side.sector,0,w.sectors.length-1))invalid();
  const defaults=createPlayerStatus();
  for(const key of ['health','armor','armorType','bonusCount','damageCount'] as const)if(!Number.isFinite(save.player[key]))invalid();
  for(const field of ['ammo','maxAmmo','powers'] as const)for(const key of Object.keys(defaults[field])){
    if(!Number.isFinite((save.player[field] as Record<string,number>)?.[key]))invalid();
  }
  for(const field of ['weapons','cards'] as const)for(const key of Object.keys(defaults[field]))if(typeof (save.player[field] as Record<string,boolean>)?.[key]!=='boolean')invalid();
  if(!Object.hasOwn(defaults.weapons,save.player.currentWeapon)||!Object.hasOwn(defaults.ammo,save.player.currentAmmo))invalid();
  if(save.player.pendingWeapon!==null&&!Object.hasOwn(defaults.weapons,save.player.pendingWeapon))invalid();
  if(!['PST_LIVE','PST_DEAD','PST_REBORN'].includes(save.player.playerState))invalid();
  if(!save.player.mobjState||typeof save.player.mobjState.name!=='string'||!Number.isFinite(save.player.mobjState.tics))invalid();
  if(!Number.isFinite(save.view.yaw)||!Number.isFinite(save.view.pitch))invalid();
  for(const key of ['kills','items','secrets'] as const)if(!integer(save.stats[key],0,1000000))invalid();
  if(!Array.isArray(save.automap.seen)||save.automap.seen.some(i=>!integer(i,0,w.lines.length-1))||!Array.isArray(save.automap.marks)||!save.automap.center||!Number.isFinite(save.automap.zoom))invalid();
  for(const point of [save.automap.center,...save.automap.marks])if(!Number.isFinite(point.x)||!Number.isFinite(point.y))invalid();
  for(const sprite of save.sprites.sprites)if(!integer(sprite.index,0,100000)||!integer(sprite.frame,0,100)||!Number.isFinite(sprite.tics))invalid();
  for(const psp of save.weapons.psprites)if(!(psp.state===null||typeof psp.state==='string')||![psp.tics,psp.sx,psp.sy].every(Number.isFinite))invalid();
  for(const [sector,index] of w.ai.sounds)if(!integer(sector,0,w.sectors.length-1)||!integer(index,-1,w.actors.length-1))invalid();
  for(const button of w.use.buttons)if(!integer(button.side,0,w.sides.length-1)||!['upper','middle','lower'].includes(button.position)||!integer(button.timer,1,35)||typeof button.originalTex!=='string')invalid();
  const fields:Record<string,string[]>={door:['topHeight','speed','direction','topWait','topCountdown'],floor:['destHeight','speed','direction'],platform:['speed','low','high','wait','count'],stair:['speed','direction','destHeight'],ceiling:['bottomHeight','topHeight','speed','direction','tag','oldDirection'],light:['min','max','count','dark','direction']};
  for(const record of w.thinkers) {
    if(record.kind==='mobj')continue;
    const data=record.data as Record<string,unknown>;
    for(const key of fields[record.kind])if(!Number.isFinite(data[key]))invalid();
    if(record.kind==='platform'&&!['up','down','waiting','stasis'].includes(String(data.status)))invalid();
    if(record.kind==='light'&&!['fire','flash','strobe','glow'].includes(String(data.type)))invalid();
  }
  return save;
}
export class SaveSlots {
  constructor(private storage: Pick<Storage,'getItem'|'setItem'>,private wad:string) {}
  label(slot:number):string {
    try {const text=this.storage.getItem(SAVE_PREFIX+slot);if(!text)return 'Empty';const save=decodeSave(text,this.wad);return save.label;}
    catch {return 'Unavailable save';}
  }
  write(slot:number,save:SaveGame):void {
    if(!integer(slot,0,SAVE_SLOTS-1))invalid();
    const text=JSON.stringify(save);decodeSave(text,this.wad);
    try {this.storage.setItem(SAVE_PREFIX+slot,text);} catch {throw new Error('Could not save: browser storage is unavailable or full.');}
  }
  read(slot:number):SaveGame {
    if(!integer(slot,0,SAVE_SLOTS-1))invalid();
    const text=this.storage.getItem(SAVE_PREFIX+slot);
    if(!text)throw new Error('This slot is empty.');
    return decodeSave(text,this.wad);
  }
}
