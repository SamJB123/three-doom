import test from 'node:test';
import assert from 'node:assert/strict';
import {triangulateSector} from '../src/wad/SectorBuilder';
test('sector triangulation preserves holes, islands and disconnected outer loops',()=>{
  const vertices=[...[[0,0],[10,0],[10,10],[0,10]],...[[2,2],[8,2],[8,8],[2,8]],...[[4,4],[6,4],[6,6],[4,6]],...[[20,0],[24,0],[24,4],[20,4]]].map(([x,y])=>({x,y}));
  const groups=triangulateSector([[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]],vertices);
  let area=0;
  for(const group of groups)for(let i=0;i<group.triangles.length;i+=3){
    const [a,b,c]=group.triangles.slice(i,i+3).map(n=>vertices[group.vertices[n]]);
    area+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;
    const x=(a.x+b.x+c.x)/3,y=(a.y+b.y+c.y)/3;
    assert(!(x>2&&x<8&&y>2&&y<8) || (x>=4&&x<=6&&y>=4&&y<=6));
  }
  assert.equal(area,100-36+4+16);assert.equal(groups.length,3);
});
