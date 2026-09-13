import test from 'node:test';
import assert from 'node:assert/strict';
import {HudFace} from '../src/hud/HudFace';
import {createPlayerStatus} from '../src/ecs/traits';
import {createPlayer} from '../src/physics/DoomMovement';
import {FRACUNIT as F} from '../src/math/fixed';

test('HUD faces point at the attacker rather than a random direction or AI target',()=>{
  const player=createPlayer(0,0,0).mo,attacker=createPlayer(0,100,0).mo;
  player.angle=0;player.lastAttacker=attacker;
  for(const [x,y,expected] of [[100,0,7],[0,100,4],[0,-100,3]] as const){
    const state=createPlayerStatus(),face=new HudFace();face.reset(state);
    attacker.x=x*F;attacker.y=y*F;state.damageCount=10;
    assert.equal(face.tick(state,false,player,0),expected);
    assert.equal(face.tick(state,false,player,2),expected,'damage reaction persists while damagecount is active');
  }
  const state=createPlayerStatus(),face=new HudFace();face.reset(state);state.damageCount=10;
  player.lastAttacker=null;assert.equal(face.tick(state,false,player,0),7,'environment damage looks straight ahead');
});
test('sustained fire waits two seconds, release resets delay, god mode and death have priority',()=>{
  const state=createPlayerStatus(),face=new HudFace();face.reset(state);
  for(let i=0;i<70;i++)assert.ok(face.tick(state,true,undefined,0)<3);
  assert.equal(face.tick(state,true,undefined,0),7);
  assert.equal(face.tick(state,false,undefined,0),0);
  for(let i=0;i<70;i++)assert.ok(face.tick(state,true,undefined,0)<3);
  state.godMode=true;face.reset(state);assert.equal(face.tick(state,false,undefined,0),40);
  state.health=0;assert.equal(face.tick(state,false,undefined,0),41);
  state.health=100;state.godMode=false;face.reset(state);assert.equal(face.tick(state,false,undefined,2),2);
});
test('new-weapon grin lasts 70 tics and overrides damage; reset uses current inventory',()=>{
  const state=createPlayerStatus(),face=new HudFace();face.reset(state);
  state.weapons.shotgun=true;state.bonusCount=6;state.damageCount=10;
  for(let i=0;i<70;i++)assert.equal(face.tick(state,false,undefined,0),6);
  state.bonusCount=state.damageCount=0;assert.equal(face.tick(state,false,undefined,0),0);
  face.reset(state);state.bonusCount=6;assert.equal(face.tick(state,false,undefined,1),1);
});
