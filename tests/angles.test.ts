import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pointToAngle,angleToRadians,radiansToAngle,fineSin,fineCos} from '../src/math/angles';
import {finesine,tantoangle} from '../src/math/AngleTables';
const reference=JSON.parse(readFileSync(new URL('./fixtures/angle-reference.json',import.meta.url),'utf8'));
test('R_PointToAngle matches executed C across octants, axes and small denominators',()=>{
  for(const row of reference.cases)assert.equal(pointToAngle(row.x,row.y),row.angle,JSON.stringify(row));
});
test('source fine angles retain half-step samples and wrap binary angles',()=>{
  assert.equal(finesine.length,10240);assert.equal(tantoangle.length,2049);
  assert.equal(fineSin(0),25);assert.equal(fineCos(0),65535);
  for(let i=0;i<8192;i++){
    const angle=(i*0x80000)>>>0;
    assert.equal(radiansToAngle(angleToRadians(angle)),angle);
    assert.equal(fineSin(angleToRadians(angle)),finesine[i]);
    assert.equal(fineCos(angleToRadians(angle)),finesine[i+2048]);
  }
  assert.equal(fineSin(-Math.PI/2),finesine[6144]);
});
