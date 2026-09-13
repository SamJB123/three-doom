import test from 'node:test';
import assert from 'node:assert/strict';
import {AttractSequence} from '../src/game/AttractSequence.ts';
import {GameSession} from '../src/game/GameSession.ts';
import {TicClock} from '../src/game/TicClock.ts';

test('retail title, credits and all four demos follow D_DoAdvanceDemo order and page durations',()=>{
  const sequence=new AttractSequence();
  for(const name of ['TITLEPIC','DEMO1','CREDIT','DEMO2','CREDIT','DEMO3','DEMO4','TITLEPIC']){
    assert.equal(sequence.name,name);
    if(!sequence.demo){
      const duration=name==='TITLEPIC'?170:200;
      for(let i=0;i<duration;i++)assert.equal(sequence.tick(),false);
      assert.equal(sequence.tick(),true);
    }else assert.equal(sequence.tick(),false);
    sequence.advance();
  }
  sequence.reset();assert.equal(sequence.name,'TITLEPIC');assert.equal(sequence.remaining,170);
});
test('watching demos is not a user game, and menus pause its single clock',()=>{
  const session=new GameSession(), sequence=new AttractSequence(), clock=new TicClock();
  assert.equal(session.attracting,false);
  session.menu=null;
  assert.equal(session.attracting,true);assert.equal(session.running,false);
  clock.advance(1/35,session.attracting,()=>sequence.tick());assert.equal(sequence.remaining,169);
  session.open();clock.advance(20,session.attracting,()=>sequence.tick());assert.equal(sequence.remaining,169);
  session.start();assert.equal(session.attracting,false);assert.equal(session.running,true);
});
