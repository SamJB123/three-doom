import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three/webgpu';
import {allMobjs,initMobjSystem} from '../src/game/Mobj';
import {resetThinkers} from '../src/game/Thinkers';
import {archiveRandom,restoreRandom} from '../src/game/DoomRandom';
import {spawnHitEffect} from '../src/game/HitEffects';
import {dividedMap} from './fixtures/maps';
const F=65536;
test('P_SpawnPuff/P_SpawnBlood consume four draws and select source damage/melee states',()=>{
  for(const [blood,damage,melee,state,tics] of [[false,0,false,'S_PUFF1',2],[false,0,true,'S_PUFF3',4],[true,20,false,'S_BLOOD1',6],[true,12,false,'S_BLOOD2',8],[true,9,false,'S_BLOOD2',8],[true,8,false,'S_BLOOD3',8]] as const){
    resetThinkers();allMobjs.length=0;initMobjSystem({},new Group(),dividedMap());restoreRandom({play:0,misc:0});
    const effect=spawnHitEffect(40*F,0,32*F,damage,blood,melee);
    assert.equal(effect.z,32*F+((8-109)<<10));assert.equal(effect.momz,(blood?2:1)*F);
    assert.equal(effect.state,state);assert.equal(effect.tics,tics);assert.equal(archiveRandom().play,4);
  }
  resetThinkers();allMobjs.length=0;
});

test('P_LineAttack creates wall puffs and target blood even with zero damage, but suppresses sky-wall puffs',async()=>{
  const {lineAttack,setAttackMap}=await import('../src/game/Attack');
  const {spawnMobj}=await import('../src/game/Mobj');
  const {MF_NOBLOOD}=await import('../src/game/MobjData');
  for(const mode of ['wall','sky','blood','no-blood']){
    resetThinkers();allMobjs.length=0;const map=dividedMap();
    if(mode==='wall'||mode==='sky'){map.linedefs[0].left=-1;map.linedefs[0].flags=0;}
    if(mode==='sky')map.sectors[0].ceilingTex='F_SKY1';
    initMobjSystem({},new Group(),map);setAttackMap(map);
    const source=spawnMobj(80*F,0,0,'MT_PLAYER');
    if(mode==='blood'||mode==='no-blood'){
      const target=spawnMobj(-40*F,0,0,'MT_POSSESSED');if(mode==='no-blood')target.flags|=MF_NOBLOOD;
    }
    restoreRandom({play:0,misc:0});
    lineAttack(source.x,0,(mode==='sky'?160:32)*F,Math.PI,0,256*F,0,source);
    const effects=allMobjs.filter(m=>m.type==='MT_PUFF'||m.type==='MT_BLOOD');
    assert.equal(effects.length,mode==='sky'?0:1,mode);
    if(effects.length)assert.equal(effects[0].type,mode==='blood'?'MT_BLOOD':'MT_PUFF');
    assert.equal(archiveRandom().play,mode==='sky'?0:4,mode);
  }
  resetThinkers();allMobjs.length=0;
});

test('P_SpawnMobj assigns effects to the precise subsector beside a low ceiling',async()=>{
  const {runThinkers}=await import('../src/game/Thinkers');
  resetThinkers();allMobjs.length=0;
  const map=dividedMap();map.sectors[1].ceilingHeight=64;
  initMobjSystem({},new Group(),map);restoreRandom({play:0,misc:0});
  const puff=spawnHitEffect(1,0,80*F,0,false),start=puff.z;
  assert.equal(puff.sectorIndex,0);assert.equal(puff.ceilingz,128*F);
  runThinkers();assert.equal(puff.z,start+F);assert.equal(puff.momz,F);
  resetThinkers();allMobjs.length=0;
});
