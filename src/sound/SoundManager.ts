import {M_Random} from '../game/DoomRandom';
import {radiansToAngle} from '../math/angles';
import {soundParameters,stereoGains,type SoundPoint} from './SoundParameters';
import {SOURCE_SOUNDS} from './SourceSounds';
let audioCtx:AudioContext|null=null,masterGain:GainNode|null=null;
let sfxBuffers:Record<string,AudioBuffer>={};
let listener:SoundPoint&{angle:number}={x:0,y:0,angle:0},mapNumber=1;
type Origin=object&{x?:number;y?:number;z?:number};
interface Channel {
  source:AudioBufferSourceNode;left:GainNode;right:GainNode;merger:ChannelMergerNode;
  origin:Origin|null;point:SoundPoint|null;priority:number;
}
const channels=new Set<Channel>();
export function setSoundVolume(volume:number):void {if(masterGain)masterGain.gain.value=Math.max(0,Math.min(1,volume));}
function dispose(channel:Channel):void {
  channels.delete(channel);channel.source.onended=null;
  channel.source.disconnect();channel.left.disconnect();channel.right.disconnect();channel.merger.disconnect();
}
function stop(channel:Channel):void {channel.source.stop();dispose(channel);}
export function stopAllSounds():void {for(const channel of [...channels])stop(channel);}
export function stopSound(origin:Origin):void {for(const channel of [...channels])if(channel.origin===origin)stop(channel);}
export function initSoundManager(ctx:AudioContext,buffers:Record<string,AudioBuffer>):void {
  stopAllSounds();audioCtx=ctx;masterGain?.disconnect();masterGain=ctx.createGain();masterGain.connect(ctx.destination);sfxBuffers=buffers;
}
function update(channel:Channel):boolean {
  const origin=channel.origin;
  const point=origin&&typeof origin.x==='number'&&typeof origin.y==='number'?{x:origin.x,y:origin.y}:channel.point;
  const params=point?soundParameters(listenerPoint(),point,mapNumber):{volume:127,separation:128};
  const gains=stereoGains(params.volume,params.separation);
  channel.left.gain.value=gains.left;channel.right.gain.value=gains.right;
  return params.volume>0;
}
// Keep the authoritative actor reference: EV_Teleport can move the player and
// start effects within a tic, before the next presentation listener update.
function listenerPoint():SoundPoint&{angle:number} {
  return {x:listener.x,y:listener.y,angle:radiansToAngle(listener.angle)};
}
/** Bind the live listener and update existing channels at the presentation boundary. */
export function updateListener(position:SoundPoint&{angle:number},map:number):void {
  listener=position;mapNumber=map;
  for(const channel of [...channels])if(!update(channel))stop(channel);
}
function start(name:string,point:SoundPoint|null,origin:Origin|null):void {
  if(!audioCtx||!masterGain)return;
  const buffer=sfxBuffers[name],info=SOURCE_SOUNDS[name];if(!buffer||!info)return;
  if(point&&soundParameters(listenerPoint(),point,mapNumber).volume===0)return;
  let pitch=info.link?info.pitch:128;
  if(['sawup','sawidl','sawful','sawhit'].includes(name))pitch+=8-(M_Random()&15);
  else if(name!=='itemup'&&name!=='tink')pitch+=16-(M_Random()&31);
  // Shared origins replace their previous effect. Anonymous positional callers
  // remain independent until their call sites provide a persistent origin.
  for(const channel of [...channels])if(origin?channel.origin===origin:!point&&!channel.point)stop(channel);
  if(channels.size>=8){
    const victim=[...channels].find(channel=>channel.priority>=info.priority);
    if(!victim)return;stop(victim);
  }
  const source=audioCtx.createBufferSource(),left=audioCtx.createGain(),right=audioCtx.createGain(),merger=audioCtx.createChannelMerger(2);
  source.buffer=buffer;source.playbackRate.value=Math.floor(2**((Math.max(0,Math.min(255,pitch))-128)/64)*65536)/65536;
  source.connect(left);source.connect(right);left.connect(merger,0,0);right.connect(merger,0,1);merger.connect(masterGain);
  const channel={source,left,right,merger,point,origin,priority:info.priority};channels.add(channel);update(channel);
  source.onended=()=>dispose(channel);source.start();
  // Session lifecycle owns resume/suspend; an effect never unpauses the context.
}
export function playSound(name:string):void {start(name,null,null);}
export function playSoundAt(name:string,x:number,y:number,_z=0,origin:Origin|null=null):void {start(name,{x,y},origin);}
