import test from 'node:test';
import assert from 'node:assert/strict';
import {powerColormap,initDoomLighting,updateDoomLighting,lightingIndex,spriteColors} from '../src/renderer/DoomLighting';
import {createPlayerStatus} from '../src/ecs/traits';
import {WeaponSystem} from '../src/game/Weapons';

test('P_PlayerThink fixed colormaps prioritize invulnerability and blink at expiry',()=>{
  const state=createPlayerStatus();assert.equal(powerColormap(state),-1);
  state.powers.infrared=200;assert.equal(powerColormap(state),1);
  state.powers.invulnerability=129;assert.equal(powerColormap(state),32);
  state.powers.invulnerability=128;assert.equal(powerColormap(state),-1,'invulnerability blink does not fall through to infrared');
  state.powers.invulnerability=127;assert.equal(powerColormap(state),32);
  state.powers.invulnerability=0;state.powers.infrared=128;assert.equal(powerColormap(state),-1);
});
test('weapon light actions reset and survive save; fixed colormaps override even bright sprites',()=>{
  const state=createPlayerStatus(),system=new WeaponSystem();
  (system as any).execAction('A_Light2',state,system.psprites[1]);assert.equal(system.extraLight,2);
  const copy=new WeaponSystem();copy.restore(system.archive());assert.equal(copy.extraLight,2);
  (copy as any).execAction('A_Light0',state,copy.psprites[1]);assert.equal(copy.extraLight,0);
  const palette=Uint8Array.from({length:768},(_,i)=>Math.floor(i/3));
  const tables=Array.from({length:34},(_,row)=>Uint8Array.from({length:256},(_,i)=>(i+row)%256));
  initDoomLighting(palette,tables);updateDoomLighting(state,0);const normal=lightingIndex(128);
  updateDoomLighting(state,2);assert.equal(lightingIndex(128),normal-4);assert.equal(lightingIndex(128,true),0);
  state.powers.invulnerability=200;updateDoomLighting(state,2);assert.equal(lightingIndex(128,true),32);
  assert.deepEqual([...spriteColors({width:1,height:1,leftOffset:0,topOffset:0,indices:new Uint8Array([100]),rgba:new Uint8Array([100,100,100,0])},32)],[132,132,132,0]);
});
