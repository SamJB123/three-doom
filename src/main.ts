import {HudMessages} from './hud/HudMessages';
import { WadGraphics } from './menu/WadGraphics';
import { WebGPURenderer, PerspectiveCamera, Scene, Clock } from 'three/webgpu';
import { createWorld } from 'koota';
import { parseWAD, getLump, parsePalette, parseColormap, parseFlats, parseTextures, parseSprites, getMapLumps } from './wad';
import { FPSControls } from './renderer/FPSControls';
import { TouchControls } from './renderer/TouchControls';
import { updateSpriteBillboards, updateSpriteAnimations, updateSpriteFloorHeights, archiveStaticSprites, restoreStaticSprites } from './renderer/SpriteRenderer';
import { setCrossSpecialCallback } from './physics/DoomMovement';
import { Time, Input, DoomWorld, Camera, IsPlayer, Position, PlayerStatus, createPlayerStatus, type PlayerStatusState } from './ecs/traits';
import { playerTickSystem, cameraSystem, syncPlayerPositionSystem } from './ecs/systems';
import { crossSpecialLine, setExitCallback } from './game/UseAction';
import { dirtySectors, clearDirtySectors } from './game/Thinkers';
import { consumeTeleport } from './game/Teleport';
import { allMobjs, spawnPlayerMissile, setCameraPosition } from './game/Mobj';
import { MF_COUNTKILL } from './game/MobjData';
import { aimLineAttack, lineAttack, setPlayerDamageMobjCallback, setPlayerDamageCallback, setKillCallback } from './game/Attack';
import { damagePlayer, radiusAttackPlayer, setSecretCallback } from './game/PlayerDamage';
import { P_NoiseAlert, advanceEnemyTic } from './game/EnemyAI';
import { checkPickups, setPickupMessageCallback, setPickupCallback, COUNTED_ITEMS } from './game/Pickups';
import { WeaponSystem } from './game/Weapons';
import { sectorChangeHandler } from './game/SectorOccupants';
import { setSectorChangeCallback } from './game/SectorHelpers';
import { feedCheatChar } from './game/Cheats';
import { archiveWorld, restoreWorld } from './game/WorldArchive';
import { SaveSlots, type SaveGame } from './game/SaveGame';
import { clearRandom } from './game/DoomRandom';
import { gameRules, type Skill } from './game/GameRules';
import { Level } from './game/Level';
import { nextMap, mapMusic } from './game/Campaign';
import { GameSession } from './game/GameSession';
import { TicClock } from './game/TicClock';
import { GameMenu } from './menu/GameMenu';
import { Automap } from './hud/Automap';
import { StatusBar } from './hud/StatusBar';
import { WeaponOverlay } from './hud/WeaponOverlay';
import { parseSounds, initSoundManager, MusicPlayer, updateListener } from './sound';
import { setSoundVolume } from './sound/SoundManager';
import { FRACUNIT } from './math/fixed';

async function main(): Promise<void> {
  const loading=document.getElementById('loading')!;
  const response=await fetch('doomu.wad');
  if (!response.ok) throw new Error('Could not load doomu.wad. Place your WAD at public/doomu.wad; see README.md.');
  const wad=parseWAD(await response.arrayBuffer());
  const wadHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',wad.buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
  // Storage access remains lazy so disabled storage does not prevent playing.
  const slots=new SaveSlots({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},wadHash);
  loading.textContent='Loading Doom assets...';
  const palette=parsePalette(wad);
  const assets={palette, colormap:parseColormap(wad), flats:parseFlats(wad,palette),
    textures:parseTextures(wad,palette), sprites:parseSprites(wad,palette)};
  const audio=new AudioContext();
  initSoundManager(audio,await parseSounds(wad,audio));
  const music=new MusicPlayer(audio);
  const genmidi=getLump(wad,'GENMIDI');
  if(genmidi) music.setGenmidiData(wad.buf.slice(genmidi.offset,genmidi.offset+genmidi.size).buffer);
  let musicName='';
  function playMusic(name: string): void {
    if(musicName===name && music.isPlaying()) return;
    const lump=getLump(wad,name);
    music.stop(); musicName=name;
    if(lump) music.play(wad.buf.slice(lump.offset,lump.offset+lump.size).buffer);
  }
  const messages=new HudMessages(new WadGraphics(wad,palette));
  setPickupMessageCallback(text=>messages.state.post(text));
  const hud=new StatusBar(); hud.loadGraphics(wad,palette);
  const weaponOverlay=new WeaponOverlay();
  let weapons=new WeaponSystem();
  const container=document.getElementById('game')!;
  const renderer=new WebGPURenderer({antialias:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth,container.clientHeight);
  renderer.domElement.tabIndex=0;
  container.appendChild(renderer.domElement);
  await renderer.init();
  const scene=new Scene(), camera=new PerspectiveCamera(90,container.clientWidth/container.clientHeight,0.1,500);
  const world=createWorld(Time,Input,DoomWorld,Camera,PlayerStatus);
  world.set(Camera,{camera}); world.spawn(IsPlayer,Position);
  const touch=TouchControls.isTouchDevice();
  const controls=touch ? new TouchControls(world) : new FPSControls(renderer.domElement,world);
  const session=new GameSession(), clock=new Clock(), ticks=new TicClock();
  const automap=new Automap(()=>session.running);
  automap.button.setAttribute('aria-label','Map');
  automap.button.replaceChildren(new WadGraphics(wad,palette).label('Map'));
  let level: Level;
  let exitRequested: boolean | null=null;
  let destination: number | null=null;
  let deathTics=0;

  function loadLevel(episode: number, number: number, skill: Skill, carry?: PlayerStatusState): void {
    controls.setEnabled(false);
    level?.dispose(); automap.reset(); messages.reset();
    level=new Level(wad,assets,episode,number,skill);
    scene.add(level.root);
    music.stop(); musicName='';
    const state=carry ? structuredClone(carry) : createPlayerStatus();
    for(const key of Object.keys(state.cards) as (keyof typeof state.cards)[]) state.cards[key]=false;
    for(const power of Object.keys(state.powers) as (keyof typeof state.powers)[]) state.powers[power]=0;
    state.bonusCount=state.damageCount=0; state.playerState='PST_LIVE'; state.mobjState={name:'S_PLAY',tics:-1};
    world.set(PlayerStatus,state); world.set(DoomWorld,{player:level.player,map:level.map});
    world.set(Time,{delta:0,elapsed:0,levelTime:0});
    level.player.mo.health=state.health;
    controls.setInitialYaw(level.startYaw); controls.setEnabled(false);
    setSectorChangeCallback(sectorChangeHandler(level.map,()=>world.get(Time)!.levelTime));
    weapons=new WeaponSystem(); weapons.setup(world.get(PlayerStatus)!);
    weapons.setNoiseCallback(()=>P_NoiseAlert(level.player.mo,level.player.mo,level.map));
    weapons.setAimCallback((angle,range)=>aimLineAttack(level.player.mo,angle,range).slope);
    weapons.setFireCallback((angle,slope,damage,range)=>{
      const mo=level.player.mo;
      lineAttack(mo.x,mo.y,mo.z+(mo.height>>1)+8*FRACUNIT,angle,slope,range,damage,mo);
    });
    weapons.setMissileCallback((angle,type)=>spawnPlayerMissile(level.player,angle,type));
    syncPlayerPositionSystem(world); cameraSystem(world);
    ticks.advance(0,false,()=>{}); clock.getDelta();
    exitRequested=null; destination=null; deathTics=0;
    hud.update(world);
  }

  setCrossSpecialCallback((idx,side,mo)=>{
    crossSpecialLine(level.map.linedefs[idx],level.map,level.player,level.things,side,mo);
  });
  setExitCallback(secret=>{ exitRequested ??= secret; });
  setKillCallback(mo=>{if(mo.flags&MF_COUNTKILL) level.kills++;});
  setSecretCallback(()=>level.secrets++);
  setPickupCallback(type=>{if(COUNTED_ITEMS.has(type)) level.items++;});
  setPlayerDamageMobjCallback(damage=>{
    const state=world.get(PlayerStatus)!; damagePlayer(state,damage); level.player.mo.health=state.health;
  });
  setPlayerDamageCallback((spot,source,damage)=>{
    const state=world.get(PlayerStatus)!; radiusAttackPlayer(level.player,state,spot,source,damage); level.player.mo.health=state.health;
  });
  clearRandom(); loadLevel(1,1,3);

  function saveGame(slot: number): void {
    if(!session.started||session.phase!=='level')throw new Error('Start a level before saving.');
    const time=world.get(Time)!;
    const save:SaveGame={format:'three-doom',version:1,wad:wadHash,
      label:`E${gameRules.episode}M${gameRules.map} · ${Math.floor(time.levelTime/35)}s`,savedAt:new Date().toISOString(),
      episode:gameRules.episode,map:gameRules.map,skill:gameRules.skill,tic:time.levelTime,
      world:archiveWorld(level.map,level.player),player:structuredClone(world.get(PlayerStatus)!),weapons:weapons.archive(),
      sprites:archiveStaticSprites(level.sprites),automap:automap.archive(),
      view:{yaw:world.get(Input)!.yaw,pitch:world.get(Input)!.pitch},stats:{kills:level.kills,items:level.items,secrets:level.secrets}};
    slots.write(slot,save);
  }
  function loadGame(slot: number): void {
    const save=slots.read(slot);
    const lumps=getMapLumps(wad,`E${save.episode}M${save.map}`);
    if(save.world.sectors.length!==lumps.SECTORS.size/26 || save.world.lines.length!==lumps.LINEDEFS.size/14 || save.world.sides.length!==lumps.SIDEDEFS.size/30)throw new Error('Saved map dimensions do not match this WAD.');
    loadLevel(save.episode,save.map,save.skill);
    restoreWorld(level.map,level.player,save.world);
    world.set(PlayerStatus,structuredClone(save.player));weapons.restore(save.weapons);
    restoreStaticSprites(save.sprites,level.sprites);automap.restore(save.automap);
    Object.assign(level,save.stats);
    world.set(Time,{levelTime:save.tic,delta:0,elapsed:save.tic/35});
    controls.setInitialYaw(save.view.yaw,save.view.pitch);controls.setEnabled(false);
    syncPlayerPositionSystem(world);cameraSystem(world);
    level.map.sectors.forEach((_,i)=>dirtySectors.add(i));
    session.started=true;session.phase='level';session.menu='main';
    hud.update(world);
  }
  const menu=new GameMenu(session,wad,palette,{
    messages:enabled=>{messages.state.enabled=enabled;},
    save:saveGame,load:loadGame,slotLabel:slot=>slots.label(slot),
    changed:()=>{
      controls.setEnabled(session.running); ticks.advance(0,false,()=>{}); clock.getDelta();
      if(session.running || session.presenting) {
        if(session.running)renderer.domElement.focus();
        void audio.resume().then(()=>{if(session.running)playMusic(mapMusic(gameRules.episode,gameRules.map));else if(session.presenting)playMusic(menu.presentationMusic);}).catch(console.error);
        if(session.running && !touch) renderer.domElement.requestPointerLock()?.catch(()=>{});
        else if(document.pointerLockElement)document.exitPointerLock();
      } else {
        if(document.pointerLockElement) document.exitPointerLock();
        void audio.suspend().catch(console.error);
      }
    },
    newGame:(episode,skill)=>{clearRandom();loadLevel(episode,1,skill);},
    end:()=>{
      loadLevel(1,1,3); session.started=false; session.phase='level'; session.menu='main'; menu.refresh();
    },
    next:()=>{
      if(destination===null) { session.started=false; session.phase='level'; session.menu='main'; loadLevel(1,1,3); menu.refresh(); }
      else {loadLevel(gameRules.episode,destination,gameRules.skill,world.get(PlayerStatus)!);menu.start();}
    },
    volume:(musicVolume,soundVolume)=>{music.setVolume(musicVolume);setSoundVolume(soundVolume);}
  });
  const gameActions=document.createElement('div');gameActions.id='game-actions';
  gameActions.append(automap.button,document.getElementById('menu-button')!);
  document.body.append(gameActions);
  document.addEventListener('pointerlockchange',()=>{if(!touch && !document.pointerLockElement && session.running) menu.open();});
  window.addEventListener('blur',()=>{if(session.running) menu.open();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && session.running) menu.open();});
  document.addEventListener('keydown',event=>{if(event.code==='Enter' && session.running && !event.repeat)messages.refresh();});
  document.addEventListener('keypress',e=>{if(session.running) feedCheatChar(e.key,world.get(PlayerStatus)!);});
  const resize=()=>{camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();renderer.setSize(container.clientWidth,container.clientHeight);};
  window.addEventListener('resize',resize); screen.orientation?.addEventListener('change',resize);
  if(import.meta.env.DEV && new URLSearchParams(location.search).has('inspect')) {
    Object.defineProperty(window,'__doomInspect',{value:()=>({
      audio:audio.state,music:musicName,presentation:menu.inspectPresentation(), started:session.started,running:session.running, phase:session.phase,
      episode:gameRules.episode,map:gameRules.map,skill:gameRules.skill,tic:world.get(Time)!.levelTime,
      player:{x:level.player.mo.x,y:level.player.mo.y,z:level.player.mo.z,health:world.get(PlayerStatus)!.health,ammo:{...world.get(PlayerStatus)!.ammo}},
      input:{...world.get(Input)!},
      actors:allMobjs.map(mo=>({x:mo.x,y:mo.y,z:mo.z,health:mo.health,state:mo.state,tics:mo.tics})),
      sectors:level.map.sectors.map(s=>[s.floorHeight,s.ceilingHeight,s.lightLevel])
    })});
  }
  loading.style.display='none';
  renderer.setAnimationLoop(()=>{
    const dt=clock.getDelta(), time=world.get(Time)!;
    time.delta=0; time.elapsed=time.levelTime/35;
    controls.update();
    let finishPresentation=false;
    ticks.advance(dt,session.running || session.presenting,()=>{
      if(session.presenting){finishPresentation=menu.tickPresentation() || finishPresentation;return;}
      if(!session.running || exitRequested!==null) return;
      time.delta=1/35;
      playerTickSystem(world);
      const tp=consumeTeleport();
      if(tp) {const yaw=tp.angle*Math.PI/180-Math.PI/2;controls.setInitialYaw(yaw);world.set(Input,{yaw});}
      weapons.tick(world); advanceEnemyTic();
      const state=world.get(PlayerStatus)!; level.player.mo.health=state.health;
      if(state.playerState!=='PST_DEAD') checkPickups(world,level.sprites,level.player.mo.x,level.player.mo.y,level.player.mo.z);
      else deathTics++;
      if((time.levelTime & 3) === 0) automap.discover(level.map,level.player);
      messages.tick();
      updateSpriteAnimations(1/35);hud.update(world);
    });
    if(finishPresentation)menu.finishPresentation();
    if(exitRequested!==null) {
      if(gameRules.map===9)world.get(PlayerStatus)!.didSecret=true;
      destination=nextMap(gameRules.episode,gameRules.map,exitRequested);exitRequested=null;
      menu.complete({didSecret:world.get(PlayerStatus)!.didSecret,episode:gameRules.episode,map:gameRules.map,next:destination,kills:level.kills,totalKills:level.totalKills,
        items:level.items,totalItems:level.things.filter(t=>COUNTED_ITEMS.has(t.type)).length,secrets:level.secrets,totalSecrets:level.totalSecrets,time:Math.floor(time.levelTime/35)});
    }
    if(deathTics>=105) {loadLevel(gameRules.episode,gameRules.map,gameRules.skill);session.open();menu.refresh();}
    if(session.presenting && audio.state==='running')playMusic(menu.presentationMusic);
    cameraSystem(world);
    updateListener(camera.position.x,camera.position.y,camera.position.z,-Math.sin(camera.rotation.y),-Math.cos(camera.rotation.y));
    weapons.applyBob(level.player.bob,time.levelTime);
    if(dirtySectors.size) {level.manager.rebuildDirtySectors(dirtySectors);updateSpriteFloorHeights(level.sprites);clearDirtySectors();}
    setCameraPosition(level.player.mo.x,level.player.mo.y);
    level.manager.updateAnimatedTextures(time.levelTime);updateSpriteBillboards(level.sprites,camera.rotation.y);
    level.sky?.position.copy(camera.position);
    weaponOverlay.update(weapons,assets.sprites);
    renderer.render(scene,camera);
    automap.draw(level.map,level.player,!!world.get(PlayerStatus)!.powers.allmap);
  });
}

main().catch(error=>{
  console.error(error);
  document.getElementById('loading')!.textContent=`Unable to start Doom: ${error.message}`;
});
