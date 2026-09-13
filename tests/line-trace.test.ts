import test from 'node:test';
import assert from 'node:assert/strict';
import {traceLines} from '../src/physics/LineTrace';
import {dividedMap} from './fixtures/maps';
const F=65536;
test('P_PathTraverse nudges only exact fixed block boundaries and retains endpoint deltas',()=>{
  const map=dividedMap();
  let result=traceLines(-128*F,0,64*F,0,map);
  assert.equal(result.trace.x,-127*F);assert.equal(result.trace.y,F);
  assert.equal(result.trace.dx,191*F);assert.equal(result.trace.dy,-F);
  result=traceLines(-128*F+1,1,64*F,1,map);
  assert.equal(result.trace.x,-128*F+1);assert.equal(result.trace.y,1);
});
test('PIT_AddLineIntercepts deduplicates blocks, keeps equal-fraction block-list order and handles short rays',()=>{
  const map=dividedMap();map.linedefs.push({...map.linedefs[0]});map.blockmap.lists=map.blockmap.lists.map(()=>[1,0,1]);
  for(const length of [8,64]){
    const hits=traceLines(-length*F,3*F,length*F,3*F,map).intercepts;
    assert.deepEqual(hits,[{lineIdx:1,frac:F/2},{lineIdx:0,frac:F/2}]);
  }
  assert.deepEqual(traceLines(-64*F,3*F,-32*F,3*F,map).intercepts,[]);
});
