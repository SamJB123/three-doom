import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleMapLines} from '../src/hud/MapDiscovery';
import {dividedMap} from './fixtures/maps';
import {createPlayer} from '../src/physics/DoomMovement';
import {mapTitle} from '../src/game/Campaign';

test('BSP discovery marks near walls, hides occluded walls and sees through open portals',()=>{
  const map=dividedMap();map.vertexes=[{x:32,y:32},{x:32,y:-32},{x:64,y:32},{x:64,y:-32}];
  map.linedefs=[{...map.linedefs[0],v1:0,v2:1,left:-1},{...map.linedefs[0],v1:2,v2:3,left:-1}];
  map.segs=[{v1:0,v2:1,linedef:0,side:0,offset:0,angle:0},{v1:2,v2:3,linedef:1,side:0,offset:0,angle:0}];
  map.nodes[0].x=48;map.nodes[0].rightChild=0x8001;map.nodes[0].leftChild=0x8000;
  const player=createPlayer(0,0,0);player.mo.angle=0;
  assert.deepEqual([...visibleMapLines(map,player)],[0]);
  map.linedefs[0].left=1;map.sectors[1].ceilingHeight=64;
  assert.deepEqual([...visibleMapLines(map,player)],[0,1]);
  map.sectors[1].ceilingHeight=0;assert.deepEqual([...visibleMapLines(map,player)],[0]);
});
test('angular spans discover narrow walls between old one-degree rays and respect FOV/backfaces',()=>{
  const map=dividedMap();map.nodes=[];map.subsectors=[{firstSeg:0,numSegs:1}];
  map.vertexes=[{x:1000,y:2},{x:1000,y:1}];map.linedefs=[{...map.linedefs[0],left:-1}];map.segs=[map.segs[0]];
  const player=createPlayer(0,0,0);player.mo.angle=0;
  assert.deepEqual([...visibleMapLines(map,player)],[0]);
  player.mo.angle=Math.PI;assert.equal(visibleMapLines(map,player).size,0);
  player.mo.angle=Math.PI/3;assert.equal(visibleMapLines(map,player).size,0);
  assert.equal(visibleMapLines(map,player,Math.PI*0.4).size,1);
  player.mo.x=2000*65536;player.mo.angle=Math.PI;assert.equal(visibleMapLines(map,player).size,0);
});
test('automap uses all 36 canonical episode/map titles',()=>{
  for(let episode=1;episode<=4;episode++)for(let map=1;map<=9;map++)assert.ok(mapTitle(episode,map).startsWith(`E${episode}M${map}: `));
  assert.equal(mapTitle(1,1),'E1M1: Hangar');assert.equal(mapTitle(4,9),'E4M9: Fear');
});
