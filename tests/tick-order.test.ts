import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from 'koota';
import {Group} from 'three/webgpu';
import {Time,Input,DoomWorld,PlayerStatus} from '../src/ecs/traits';
import {playerTickSystem,playerMobjTickSystem} from '../src/ecs/systems';
import {createPlayer} from '../src/physics/DoomMovement';
import {allMobjs,initMobjSystem,restoreMobjThinker,setPlayerThinkerCallback} from '../src/game/Mobj';
import {addThinker,resetThinkers,archiveThinkers} from '../src/game/Thinkers';
import {dividedMap} from './fixtures/maps';
import {FRACUNIT as F} from '../src/math/fixed';

test('weapons run before actor thinkers; player movement runs once in its insertion slot',()=>{
  resetThinkers();allMobjs.length=0;
  const map=dividedMap(),player=createPlayer(50,0,0);
  initMobjSystem({},new Group(),map);
  const world=createWorld(Time,Input,DoomWorld,PlayerStatus);
  world.set(DoomWorld,{map,player});world.set(Input,{forward:1,yaw:-Math.PI/2});
  const status=world.get(PlayerStatus)!;status.powers.invisibility=1;
  const sequence:string[]=[];
  addThinker(()=>{sequence.push('before player');assert.equal(player.mo.x,50*F);assert.equal(status.powers.invisibility,0);return false;});
  allMobjs.push(player.mo);restoreMobjThinker(player.mo);
  setPlayerThinkerCallback(()=>{sequence.push('player');playerMobjTickSystem(world);});
  addThinker(()=>{sequence.push('after player');assert(player.mo.x>50*F);return false;});
  playerTickSystem(world,()=>{
    sequence.push('weapon');assert.equal(player.mo.x,50*F);assert.equal(status.powers.invisibility,1);
    addThinker(()=>{sequence.push('new projectile');return false;});
  });
  assert.deepEqual(sequence,['weapon','before player','player','after player','new projectile']);
  assert.equal(world.get(Time)!.levelTime,1);
  assert.deepEqual(archiveThinkers(),[{kind:'mobj',data:0}]);
  world.destroy();resetThinkers();allMobjs.length=0;
});
