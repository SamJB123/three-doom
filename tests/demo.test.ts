import test from 'node:test';
import assert from 'node:assert/strict';
import {readDemo,demoInput} from '../src/game/Demo';
import {radiansToAngle} from '../src/math/angles';
const header=[109,2,1,1,0,0,0,0,0,1,0,0,0];
test('version-109 demos decode signed movement/turns and stop only at a command marker',()=>{
  const demo=readDemo(Uint8Array.from([...header,50,216,255,3,0,0,128,60,128]));
  assert.deepEqual(demo,{skill:3,episode:1,map:1,commands:[{forward:50,side:-40,turn:-256,buttons:3},{forward:0,side:0,turn:-32768,buttons:60}]});
  const input=demoInput(demo.commands[0],0);assert.equal(radiansToAngle(input.yaw+Math.PI/2),0xff000000);assert.equal(input.forward,2);assert.equal(input.strafe,-40/24);assert(input.attack&&input.use);
  assert.equal(demoInput(demo.commands[1],0).weaponSelect,8);
});
test('demo parser rejects truncation, incompatible rules and unsupported control commands',()=>{
  for(const bytes of [[...header],[...header,1,2,3],[...header,0,0,0,128,128],[108,...header.slice(1),128],[...header.slice(0,4),1,...header.slice(5),128]])assert.throws(()=>readDemo(Uint8Array.from(bytes)));
});

test('command decoding matches executed original G_ReadDemoTiccmd',async()=>{
  const {readFileSync}=await import('node:fs');
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/demo-reference.json',import.meta.url),'utf8'));
  for(const {input,expected} of fixture.cases){
    const demo=readDemo(Uint8Array.from([...header,...input,128]));
    const command=demo.commands[0];
    assert.deepEqual(command?[command.forward,command.side,command.turn,command.buttons,0]:[0,0,0,0,1],expected);
  }
});
