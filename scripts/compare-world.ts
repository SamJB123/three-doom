import {readFileSync,writeFileSync} from 'node:fs';
import {SOURCE_STATES,SOURCE_TYPES} from '../src/game/SourceMobjData';
import {WEAPON_SLOTS,CARD_TYPES,POWER_TYPES} from '../src/ecs/traits';
import {radiansToAngle} from '../src/math/angles';
const original=readFileSync('artifacts/reference-world/trace.jsonl','utf8').trim().split('\n').map(row=>JSON.parse(row));
const provenance=JSON.parse(readFileSync('artifacts/reference-world/provenance.json','utf8'));
const port=JSON.parse(readFileSync(`artifacts/port-${provenance.demo.toLowerCase()}-trace.json`,'utf8'));
const fields=['tic','x','y','z','momx','momy','momz','angle','health','state','tics','random','weaponX','weaponY','weapon'];
function firstMismatch(original:any,port:any,path:string):any {
  if(Array.isArray(original)&&Array.isArray(port)){
    if(original.length!==port.length)return {path:path+'.length',original:original.length,port:port.length};
    for(let i=0;i<original.length;i++){const mismatch=firstMismatch(original[i],port[i],path+'.'+i);if(mismatch)return mismatch;}
  }else if(original!==port)return {path,original,port};
  return null;
}
const states=Object.keys(SOURCE_STATES),types=Object.keys(SOURCE_TYPES),differences:any[]=[],actorDifferences:any[]=[],worldDifferences:any[]=[];
for(let i=0;i<Math.min(original.length,port.length);i++){
  const frame=port[i],actor=frame.actors.find((a:any[])=>a[0]==='MT_PLAYER');
  const values=[frame.tic,...actor.slice(1,7),radiansToAngle(actor[7]),actor[8],states.indexOf(actor[9]),actor[10],frame.random,frame.weapons.psprites[0].sx,frame.weapons.psprites[0].sy,WEAPON_SLOTS.indexOf(frame.player.currentWeapon)];
  const actors=original[i][15];
  if(actors){
    if(actors.length!==frame.actors.length)actorDifferences.push({tic:i+1,counts:[actors.length,frame.actors.length]});
    for(let a=0;a<Math.min(actors.length,frame.actors.length);a++){
      const ours=frame.actors[a],mapped=[types.indexOf(ours[0]),...ours.slice(1,7),radiansToAngle(ours[7]),ours[8],states.indexOf(ours[9]),ours[10],ours[11],ours[12]];
      if(mapped.some((value:number,j:number)=>value!==actors[a][j]))actorDifferences.push({tic:i+1,actor:a,type:ours[0],original:actors[a],port:mapped});
    }
  }
  const state=frame.player,ammo=['clip','shell','cell','misl'];
  const inventory=[state.armor,state.armorType,state.pendingWeapon===null?10:WEAPON_SLOTS.indexOf(state.pendingWeapon),state.bonusCount,state.damageCount,['PST_LIVE','PST_DEAD','PST_REBORN'].indexOf(state.playerState),...ammo.map(k=>state.ammo[k]),...ammo.map(k=>state.maxAmmo[k]),...WEAPON_SLOTS.map(k=>Number(state.weapons[k])),...CARD_TYPES.map(k=>Number(state.cards[k])),...POWER_TYPES.map(k=>state.powers[k])];
  const world={sectors:frame.sectors,sides:frame.sides.map((s:any[])=>s.slice(0,2)),inventory};
  for(const field of ['sectors','sides','inventory'] as const){
    const mismatch=firstMismatch(original[i][16]?.[field],world[field],field);if(mismatch)worldDifferences.push({tic:i+1,field,...mismatch});
  }
  for(let j=0;j<fields.length;j++)if(values[j]!==original[i][j])differences.push({tic:i+1,field:fields[j],original:original[i][j],port:values[j]});
}
const report={compared:Math.min(original.length,port.length),originalLength:original.length,portLength:port.length,firstByField:Object.fromEntries(fields.flatMap(field=>{const first=differences.find(row=>row.field===field);return first?[[field,first]]:[];})),differences};
writeFileSync('artifacts/reference-world/comparison.json',JSON.stringify({...report,actorDifferences,worldDifferences},null,2));
console.log(JSON.stringify({...report,differences:differences.length,actorDifferences:actorDifferences.length,firstActor:actorDifferences[0],worldDifferences:worldDifferences.length,firstWorld:worldDifferences[0]},null,2));
if(process.argv.includes('--check')&&(!original.length||differences.length||actorDifferences.length||worldDifferences.length||original.length!==port.length))process.exitCode=1;
