import test from 'node:test';
import assert from 'node:assert/strict';
import {hudPalette,paletteChannels} from '../src/hud/PaletteEffects';
import {createPlayerStatus} from '../src/ecs/traits';

test('ST_doPaletteStuff selects original damage/bonus strengths, priority and suit blink',()=>{
  const state=createPlayerStatus();assert.equal(hudPalette(state),0);
  state.damageCount=1;assert.equal(hudPalette(state),2);
  state.damageCount=100;assert.equal(hudPalette(state),8);
  state.bonusCount=6;assert.equal(hudPalette(state),8);
  state.damageCount=0;assert.equal(hudPalette(state),10);
  state.bonusCount=100;assert.equal(hudPalette(state),12);
  state.bonusCount=0;state.powers.strength=1;assert.equal(hudPalette(state),3);
  state.powers.strength=12*64;assert.equal(hudPalette(state),0);
  state.powers.ironfeet=129;assert.equal(hudPalette(state),13);
  state.powers.ironfeet=128;assert.equal(hudPalette(state),0);
  state.powers.ironfeet=127;assert.equal(hudPalette(state),13);
  state.powers.ironfeet=119;assert.equal(hudPalette(state),0);
});
test('palette channel tables preserve authored byte mappings and reject incompatible palettes',()=>{
  const base=new Uint8Array(768),target=new Uint8Array(768);
  for(let i=0;i<256;i++){base.set([i,i,i],i*3);target.set([255-i,i>>1,100],i*3);}
  const tables=paletteChannels(base,target);
  for(let i=0;i<256;i++)assert.deepEqual(tables.map(table=>table[i]),[255-i,i>>1,100]);
  base[3]=0;assert.throws(()=>paletteChannels(base,target),/indexed-color/);
  assert.throws(()=>paletteChannels(base.subarray(1),target),/size/);
});
