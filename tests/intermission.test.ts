import test from 'node:test';
import assert from 'node:assert/strict';
import {IntermissionState} from '../src/game/IntermissionState';
const stats={episode:1,map:1,next:2,kills:1,totalKills:2,items:1,totalItems:4,secrets:0,totalSecrets:0,time:65};
test('intermission counts percentages/time/par in original stages and waits for input',()=>{
  const state=new IntermissionState(stats),sounds:string[]=[];
  for(let i=0;i<35;i++)sounds.push(...state.tick());
  assert.equal(state.stage,2);assert.equal(state.counts[0],-1);
  state.tick();assert.equal(state.counts[0],1);
  for(let i=0;i<500;i++)sounds.push(...state.tick());
  assert.equal(state.stage,10);assert.equal(state.phase,'stats');
  assert.deepEqual(state.counts,[50,25,0,65,30]);assert(sounds.includes('pistol'));assert(sounds.includes('barexp'));
  state.advance();assert.deepEqual(state.tick(),['sgcock']);assert.equal(state.phase,'next');
  for(let i=0;i<139;i++)state.tick();assert.equal(state.phase,'next');
  state.tick();assert.equal(state.phase,'leaving');
  for(let i=0;i<9;i++)state.tick();assert.equal(state.phase,'leaving');
  state.tick();assert.equal(state.phase,'done');
});
test('intermission acceleration requires separate presses for totals and next-map stage',()=>{
  const state=new IntermissionState(stats);
  state.advance();assert.deepEqual(state.tick(),['barexp']);assert.equal(state.stage,10);assert.equal(state.phase,'stats');
  state.tick();assert.equal(state.phase,'stats');
  state.advance();state.tick();assert.equal(state.phase,'next');
  state.advance();state.tick();assert.equal(state.phase,'leaving');assert.equal(state.remaining,10);
});
