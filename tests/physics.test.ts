import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, tryMove, setCrossSpecialCallback } from '../src/physics/DoomMovement.ts';
import { MF_NOCLIP, MF_SOLID, MF_DROPOFF } from '../src/game/MobjData.ts';
import { FRACUNIT as F } from '../src/math/fixed.ts';
import { dividedMap } from './fixtures/maps.ts';
import { sectorChangeHandler } from '../src/game/SectorOccupants.ts';
import { movePlane, setSectorChangeCallback } from '../src/game/SectorHelpers.ts';
import { useSpecialLine, useLines, setExitCallback } from '../src/game/UseAction.ts';
import { resetDoors } from '../src/game/Doors.ts';
import { runThinkers, resetThinkers } from '../src/game/Thinkers.ts';
import { createWorld } from 'koota';
import { PlayerStatus } from '../src/ecs/traits.ts';

// Source expectations: p_map.c PIT_CheckLine/PIT_CheckThing/P_TryMove.
test('blocking lines and solid actors stop movement; noclip bypasses both', () => {
  const map = dividedMap(), player = createPlayer(20,0,0);
  map.linedefs[0].flags |= 1;
  assert.equal(tryMove(player.mo,10*F,0,map),false);
  map.linedefs[0].flags = 4;
  const other = createPlayer(10,0,0).mo; map.mobjs!.push(other);
  assert.equal(tryMove(player.mo,10*F,0,map),false);
  other.flags &= ~MF_SOLID;
  assert.equal(tryMove(player.mo,10*F,0,map),true);
  other.flags |= MF_SOLID; player.mo.flags |= MF_NOCLIP; map.linedefs[0].flags |= 1;
  assert.equal(tryMove(player.mo,-10*F,0,map),true);
});

test('cross specials require centre crossing and report original side', () => {
  const map = dividedMap(), player = createPlayer(20,0,0), hits: number[] = [];
  map.linedefs[0].special = 2;
  setCrossSpecialCallback((_line, side) => hits.push(side));
  tryMove(player.mo,10*F,0,map); assert.deepEqual(hits,[]);
  tryMove(player.mo,5*F,10*F,map); assert.deepEqual(hits,[]);
  tryMove(player.mo,-5*F,10*F,map); assert.deepEqual(hits,[0]);
  tryMove(player.mo,5*F,10*F,map); assert.deepEqual(hits,[0,1]);
  player.mo.flags |= MF_NOCLIP; tryMove(player.mo,-5*F,10*F,map); assert.deepEqual(hits,[0,1]);
  setCrossSpecialCallback(() => {});
});

test('players can drop off tall ledges but grounded monsters cannot', () => {
  const map = dividedMap(); map.sectors[0].floorHeight = 64;
  const player = createPlayer(20,0,64);
  assert.equal(tryMove(player.mo,10*F,0,map),true);
  player.mo.flags &= ~MF_DROPOFF;
  assert.equal(tryMove(player.mo,10*F,0,map),false);
});

test('moving floors carry stationary occupants; obstructed ceilings roll back', () => {
  const map = dividedMap(), player = createPlayer(50,0,0);
  map.mobjs!.push(player.mo);
  setSectorChangeCallback(sectorChangeHandler(map, () => 1));
  assert.equal(movePlane(map.sectors[0],8,32,false,0,1),'ok');
  assert.equal(player.mo.z,8*F);
  map.sectors[0].ceilingHeight = 64;
  assert.equal(movePlane(map.sectors[0],2,8,false,1,-1),'crushed');
  assert.equal(map.sectors[0].ceilingHeight,64);
  assert.equal(player.mo.ceilingz,64*F);
  setSectorChangeCallback(() => false);
});

test('all keyed doors require the correct card or skull; active manual doors reverse', () => {
  for (const [special,color] of [[26,'blue'],[32,'blue'],[27,'yellow'],[34,'yellow'],[28,'red'],[33,'red']] as const) {
    for (const kind of ['card','skull'] as const) {
      resetThinkers(); resetDoors(); const map=dividedMap(); map.sectors[1].ceilingHeight=0;
      const line=map.linedefs[0]; line.special=special;
      const world=createWorld(PlayerStatus), state=world.get(PlayerStatus)!;
      useSpecialLine(line,map,state); runThinkers(); assert.equal(map.sectors[1].ceilingHeight,0);
      state.cards[`${color}${kind}`]=true;
      useSpecialLine(line,map,state); runThinkers(); assert.equal(map.sectors[1].ceilingHeight,2);
      if ([26,27,28].includes(special)) {
        useSpecialLine(line,map,state); runThinkers(); assert.equal(map.sectors[1].ceilingHeight,0);
      }
      world.destroy();
    }
  }
  resetThinkers(); resetDoors();
});

test('use trace stops at nearer wall even when its endpoint is further away', () => {
  const map=dividedMap(); map.vertexes=[{x:10,y:1000},{x:10,y:-1000},{x:20,y:1},{x:20,y:-1}];
  map.linedefs=[{v1:0,v2:1,right:0,left:-1,flags:0,special:0,tag:0},{v1:2,v2:3,right:0,left:-1,flags:0,special:11,tag:0}];
  map.blockmap.lists=Array.from({length:4},()=>[0,1]);
  let exits=0; setExitCallback(()=>exits++);
  useLines(createPlayer(0,0,0),0,map); assert.equal(exits,0);
});
