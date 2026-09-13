import {angleToRadians,radiansToAngle} from '../math/angles';
import type {Skill} from './GameRules';
export interface DemoCommand {forward:number;side:number;turn:number;buttons:number;}
export interface Demo {skill:Skill;episode:number;map:number;commands:DemoCommand[];}
/** G_DoPlayDemo / G_ReadDemoTiccmd, version 109 single-player stream. */
export function readDemo(bytes:Uint8Array):Demo {
  if(bytes.length<14||bytes[0]!==109)throw Error('Unsupported or truncated Doom demo header');
  if(bytes[1]>4||bytes[2]<1||bytes[2]>4||bytes[3]<1||bytes[3]>9)throw Error('Invalid demo game setup');
  if(bytes.slice(4,9).some(Boolean)||bytes[9]!==1||bytes.slice(10,13).some(Boolean))throw Error('Demo requires unsupported multiplayer or command-line rules');
  const commands:DemoCommand[]=[];
  for(let offset=13;offset<bytes.length;offset+=4){
    if(bytes[offset]===0x80)return {skill:(bytes[1]+1) as Skill,episode:bytes[2],map:bytes[3],commands};
    if(offset+4>bytes.length)throw Error('Truncated demo command');
    const buttons=bytes[offset+3];
    if(buttons&128)throw Error('Demo special buttons require pause/save handling');
    commands.push({forward:(bytes[offset]<<24)>>24,side:(bytes[offset+1]<<24)>>24,turn:(bytes[offset+2]<<24)>>16,buttons});
  }
  throw Error('Missing demo end marker');
}
/** Preserve the original signed command magnitudes through the browser input API. */
export function demoInput(command:DemoCommand,angle:number){
  const nextAngle=(radiansToAngle(angle)+(command.turn<<16))>>>0;
  const weapon=(command.buttons>>3)&7;
  return {forward:command.forward/25,strafe:command.side/24,run:false,
    yaw:angleToRadians(nextAngle)-Math.PI/2,pitch:0,attack:!!(command.buttons&1),use:!!(command.buttons&2),
    weaponSelect:command.buttons&4?(weapon===7?8:weapon+1):-1};
}
