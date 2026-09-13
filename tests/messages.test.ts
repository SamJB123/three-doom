import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh} from 'three/webgpu';
import {createWorld} from 'koota';
import {PlayerStatus} from '../src/ecs/traits';
import {HudMessageState} from '../src/game/HudMessageState';
import {PICKUP_MESSAGES} from '../src/game/PickupMessages';
import {checkPickups,setPickupMessageCallback} from '../src/game/Pickups';

test('HU message timing, replacement, disabled pending messages and refresh',()=>{
  const state=new HudMessageState();state.post('first');state.tick();assert.equal(state.remaining,140);
  for(let i=0;i<139;i++)state.tick();assert.equal(state.remaining,1);state.tick();assert.equal(state.remaining,0);
  state.refresh();assert.equal(state.remaining,140);
  state.enabled=false;state.post('second');state.tick();assert.equal(state.text,'first');
  state.enabled=true;state.tick();assert.equal(state.text,'second');assert.equal(state.remaining,140);
  state.post('third');state.post('last');state.tick();assert.equal(state.text,'last');
  state.reset();assert.equal(state.remaining,0);assert.equal(state.text,'');
});
function item(type:number){const mesh=new Mesh();mesh.userData={thingType:type,thingX:0,thingY:0};return mesh;}
test('every supported pickup posts its original message only when collected',()=>{
  for(const [type,message] of Object.entries(PICKUP_MESSAGES)){
    const world=createWorld(PlayerStatus),state=world.get(PlayerStatus)!;
    state.health=1;state.armor=0;state.ammo={clip:0,shell:0,misl:0,cell:0};
    const group=new Group(),mesh=item(Number(type));group.add(mesh);
    const seen:string[]=[];setPickupMessageCallback(text=>seen.push(text));
    checkPickups(world,group,0,0,0);assert.deepEqual(seen,[message],type);assert.equal(group.children.length,0);
    world.destroy();
  }
});
test('bonuses and soul spheres collect at cap, while full-health medikits refuse',()=>{
  const world=createWorld(PlayerStatus),state=world.get(PlayerStatus)!;state.health=state.armor=200;
  const seen:string[]=[];setPickupMessageCallback(text=>seen.push(text));
  for(const type of [2014,2015,2013]){const group=new Group();group.add(item(type));checkPickups(world,group,0,0,0);assert.equal(group.children.length,0);}
  assert.equal(seen.length,3);assert.equal(state.health,200);assert.equal(state.armor,200);
  const group=new Group();group.add(item(2012));checkPickups(world,group,0,0,0);assert.equal(seen.length,3);assert.equal(group.children.length,1);
  world.destroy();
});
test('berserk preserves surplus health and requests fists; keys collect silently when already owned',()=>{
  const world=createWorld(PlayerStatus),state=world.get(PlayerStatus)!;
  const seen:string[]=[];setPickupMessageCallback(text=>seen.push(text));
  const collect=(type:number)=>{const group=new Group();group.add(item(type));checkPickups(world,group,0,0,0);assert.equal(group.children.length,0);};
  state.health=175;collect(2023);assert.equal(state.health,175);assert.equal(state.pendingWeapon,'fist');
  state.health=12;collect(2023);assert.equal(state.health,100);
  state.bonusCount=80;collect(5);assert.equal(state.bonusCount,12);
  const messages=seen.length;collect(5);assert.equal(seen.length,messages);assert.equal(state.bonusCount,18);
  world.destroy();
});
test('empty ammo replenishment uses P_GiveAmmo weapon preferences without overriding deliberate selection',()=>{
  for(const [type,ammo,weapon] of [[2007,'clip','chaingun'],[2008,'shell','shotgun'],[2047,'cell','plasma'],[2010,'misl','missile']] as const){
    const world=createWorld(PlayerStatus),state=world.get(PlayerStatus)!;
    state.currentWeapon='fist';state.weapons[weapon]=true;state.ammo[ammo]=0;
    const collect=()=>{const group=new Group();group.add(item(type));checkPickups(world,group,0,0,0);};
    collect();assert.equal(state.pendingWeapon,weapon);assert.equal(state.currentWeapon,'fist');
    state.pendingWeapon=null;collect();assert.equal(state.pendingWeapon,null);
    state.currentWeapon='chainsaw';state.ammo[ammo]=0;collect();assert.equal(state.pendingWeapon,null);
    world.destroy();
  }
});

test('locked manual doors and tagged objects report original key colors only on player refusal',async()=>{
  const {setDoorMessageCallback,evVerticalDoor,resetDoors}=await import('../src/game/Doors');
  const {useSpecialLine}=await import('../src/game/UseAction');
  const {resetThinkers}=await import('../src/game/Thinkers');
  const {dividedMap}=await import('./fixtures/maps');
  const {createPlayerStatus}=await import('../src/ecs/traits');
  const messages:string[]=[];setDoorMessageCallback(text=>messages.push(text));
  for(const [color,manual,objects] of [['blue',[26,32],[99,133]],['red',[28,33],[134,135]],['yellow',[27,34],[136,137]]] as const){
    for(const special of [...manual,...objects])for(const key of ['card','skull'] as const){
      resetThinkers();resetDoors();messages.length=0;
      const map=dividedMap(),status=createPlayerStatus();map.sectors[1].tag=7;map.sectors[1].ceilingHeight=0;
      const line={...map.linedefs[0],special,tag:7};useSpecialLine(line,map,status);
      const object=objects.some(id=>id===special);
      assert.deepEqual(messages,[`You need a ${color} key to ${object?'activate this object':'open this door'}`]);
      assert.equal(line.special,special);status.cards[`${color}${key}`]=true;
      useSpecialLine(line,map,status);assert.equal(messages.length,1,'successful unlock does not report missing key');
    }
    messages.length=0;const map=dividedMap();
    evVerticalDoor({...map.linedefs[0],special:manual[0]},map.linedefs,map.sidedefs,map.sectors,undefined,false);
    assert.equal(messages.length,0,'monster use cannot post a player message');
  }
  resetThinkers();resetDoors();setDoorMessageCallback(()=>{});
});


test('P_GivePower sets partial-invisibility actor flags during the pickup itself',async()=>{
  const {createPlayer}=await import('../src/physics/DoomMovement');
  const {MF_SHADOW}=await import('../src/game/MobjData');
  const world=createWorld(PlayerStatus),player=createPlayer(0,0,0).mo,group=new Group();group.add(item(2024));
  assert.equal(player.flags&MF_SHADOW,0);
  checkPickups(world,group,0,0,0,player);
  assert(world.get(PlayerStatus)!.powers.invisibility>0);assert.equal(player.flags&MF_SHADOW,MF_SHADOW);
  assert.equal(group.children.length,0);world.destroy();
});
