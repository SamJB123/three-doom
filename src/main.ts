import {setDoorMessageCallback} from './game/Doors';
import {initDoomLighting,updateDoomLighting} from './renderer/DoomLighting';
import {AttractSequence} from './game/AttractSequence';
import {readDemo,demoInput,type Demo} from './game/Demo';
import {archiveRandom} from './game/DoomRandom';
import {ScreenWipe} from './menu/ScreenWipe';
import {migrateLegacyMapActors} from './game/LegacySave';
import {setPlayerThinkerCallback,setMobjLevelTimeSource} from './game/Mobj';
import {playerMobjTickSystem} from './ecs/systems';
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
import { aimLineAttack, bulletSlope, lineAttack, setPlayerDamageMobjCallback, setKillCallback } from './game/Attack';
import { damagePlayer, setPlayerDeathCallback, setSecretCallback } from './game/PlayerDamage';
import { P_NoiseAlert, advanceEnemyTic } from './game/EnemyAI';
import { checkPickups, setPickupMessageCallback, setPickupCallback, COUNTED_ITEMS } from './game/Pickups';
import { WeaponSystem } from './game/Weapons';
import { sectorChangeHandler } from './game/SectorOccupants';
import { setSectorChangeCallback,setSectorTicSource } from './game/SectorHelpers';
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
import { setSoundVolume,stopAllSounds } from './sound/SoundManager';
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
  initDoomLighting(palette,assets.colormap);
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
  setDoorMessageCallback(text=>messages.state.post(text));
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
  setMobjLevelTimeSource(()=>world.get(Time)!.levelTime);
  setSectorTicSource(()=>world.get(Time)!.levelTime);
  setPlayerThinkerCallback(()=>{
    playerMobjTickSystem(world);
    const state=world.get(PlayerStatus)!;
    if(state.playerState!=='PST_DEAD')checkPickups(world,level.sprites,level.player.mo.x,level.player.mo.y,level.player.mo.z,level.player.mo);
    if(state.playerState==='PST_LIVE')level.player.mo.health=state.health;
  });
  world.set(Camera,{camera}); world.spawn(IsPlayer,Position);
  const touch=TouchControls.isTouchDevice();
  const controls=touch ? new TouchControls(world) : new FPSControls(renderer.domElement,world);
  const session=new GameSession(), clock=new Clock(), ticks=new TicClock();
  const wipe=new ScreenWipe();
  const attract=new AttractSequence();
  const attractGraphics=new WadGraphics(wad,palette);
  const attractView=document.createElement('div');attractView.id='attract-view';attractView.hidden=true;
  attractView.setAttribute('aria-label','Doom title and demo playback');
  document.body.append(attractView);
  let advanceAttract=false;
  function refreshAttract():void {
    attractView.hidden=!session.attracting;
    attractView.classList.toggle('demo',attract.demo);
    attractView.replaceChildren();
    if(!attract.demo){const page=attractGraphics.patch(attract.name);if(page)attractView.append(page.canvas);}
  }
  function advanceAttractStage():void {
    beginWipe();
    advanceAttract=false;attract.advance();
    if(attract.demo){
      const lump=getLump(wad,attract.name)!;
      const demo=readDemo(wad.buf.slice(lump.offset,lump.offset+lump.size));
      clearRandom();loadLevel(demo.episode,demo.map,demo.skill);
      replay={demo,index:0,limit:demo.commands.length,trace:[],attract:true};
      playMusic(mapMusic(demo.episode,demo.map));
    }else{replay=null;stopAllSounds();if(attract.index===0)playMusic('D_INTRO');}
    refreshAttract();
  }
  const automap=new Automap(()=>session.running&&!wipe.active,new WadGraphics(wad,palette));
  automap.button.setAttribute('aria-label','Map');
  automap.button.replaceChildren(new WadGraphics(wad,palette).label('Map'));
  let level: Level;
  let replay:{demo:Demo;index:number;limit:number;trace:unknown[];stopped?:string;attract?:boolean}|null=null;
  let exitRequested: boolean | null=null;
  let destination: number | null=null;

  function loadLevel(episode: number, number: number, skill: Skill, carry?: PlayerStatusState): void {
    replay=null;controls.setEnabled(false);
    stopAllSounds();
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
    if(state.playerState==='PST_LIVE')level.player.mo.health=state.health;
    controls.setInitialYaw(level.startYaw); controls.setEnabled(false);
    setSectorChangeCallback(sectorChangeHandler(level.map,()=>world.get(Time)!.levelTime));
    weapons=new WeaponSystem(); weapons.setup(world.get(PlayerStatus)!);
    weapons.setNoiseCallback(()=>P_NoiseAlert(level.player.mo,level.player.mo,level.map));
    weapons.setAimCallback((angle,range)=>aimLineAttack(level.player.mo,angle,range).slope);
    weapons.setBulletAimCallback(angle=>bulletSlope(level.player.mo,angle));
    weapons.setFireCallback((angle,slope,damage,range)=>{
      const mo=level.player.mo;
      return lineAttack(mo.x,mo.y,mo.z+(mo.height>>1)+8*FRACUNIT,angle,slope,range,damage,mo);
    });
    weapons.setMissileCallback((angle,type)=>spawnPlayerMissile(level.player,angle,type));
    syncPlayerPositionSystem(world); cameraSystem(world);
    updateListener(level.player.mo,gameRules.map);
    ticks.advance(0,false,()=>{}); clock.getDelta();
    exitRequested=null; destination=null;
    hud.reset(world.get(PlayerStatus)!);hud.update(world);
  }

  setCrossSpecialCallback((idx,side,mo)=>{
    crossSpecialLine(level.map.linedefs[idx],level.map,level.player,level.things,side,mo);
  });
  setExitCallback(secret=>{ exitRequested ??= secret; });
  setKillCallback(mo=>{if(mo.flags&MF_COUNTKILL) level.kills++;});
  setSecretCallback(()=>level.secrets++);
  setPickupCallback(type=>{if(COUNTED_ITEMS.has(type)) level.items++;});
  setPlayerDeathCallback(state=>{weapons.drop(state);automap.active=false;});
  setPlayerDamageMobjCallback((damage,_inflictor,source)=>{
    const state=world.get(PlayerStatus)!; return damagePlayer(state,damage,level.map.sectors[level.player.mo.sectorIndex]?.special,level.player.mo,source);
  });
  clearRandom(); loadLevel(1,1,3);

  function saveGame(slot: number): void {
    if(!session.started||session.phase!=='level')throw new Error('Start a level before saving.');
    const time=world.get(Time)!;
    const save:SaveGame={format:'three-doom',version:2,wad:wadHash,
      label:`E${gameRules.episode}M${gameRules.map} · ${Math.floor(time.levelTime/35)}s`,savedAt:new Date().toISOString(),
      episode:gameRules.episode,map:gameRules.map,skill:gameRules.skill,tic:time.levelTime,
      world:archiveWorld(level.map,level.player),player:structuredClone(world.get(PlayerStatus)!),weapons:weapons.archive(),
      sprites:archiveStaticSprites(level.sprites),automap:automap.archive(),
      view:{yaw:world.get(Input)!.yaw,pitch:world.get(Input)!.pitch},stats:{kills:level.kills,items:level.items,secrets:level.secrets}};
    slots.write(slot,save);
  }
  function loadGame(slot: number): void {
    const save=slots.read(slot);
    attract.reset();
    const lumps=getMapLumps(wad,`E${save.episode}M${save.map}`);
    if(save.world.sectors.length!==lumps.SECTORS.size/26 || save.world.lines.length!==lumps.LINEDEFS.size/14 || save.world.sides.length!==lumps.SIDEDEFS.size/30)throw new Error('Saved map dimensions do not match this WAD.');
    loadLevel(save.episode,save.map,save.skill);
    // Saves from before player-thinker integration ran the player first.
    const playerIndex=save.world.actors.findIndex(actor=>actor.type==='MT_PLAYER');
    if(!save.world.thinkers.some(record=>record.kind==='mobj' && record.data===playerIndex))
      save.world.thinkers.unshift({kind:'mobj',data:playerIndex});
    restoreWorld(level.map,level.player,save.world);
    if(save.version===1)migrateLegacyMapActors(save.sprites,level.things);
    world.set(PlayerStatus,structuredClone(save.player));weapons.restore(save.weapons);
    restoreStaticSprites(save.sprites,level.sprites);automap.restore(save.automap);
    Object.assign(level,save.stats);
    world.set(Time,{levelTime:save.tic,delta:0,elapsed:save.tic/35});
    controls.setInitialYaw(save.view.yaw,save.view.pitch);controls.setEnabled(false);
    syncPlayerPositionSystem(world);cameraSystem(world);
    level.map.sectors.forEach((_,i)=>dirtySectors.add(i));
    session.started=true;session.phase='level';session.menu='main';
    hud.reset(world.get(PlayerStatus)!);hud.update(world);
  }
  function captureScreen():HTMLCanvasElement {
    const screen=document.createElement('canvas');screen.width=320;screen.height=200;
    const ctx=screen.getContext('2d')!;ctx.imageSmoothingEnabled=false;
    const presentation=session.attracting ? (attract.demo?null:attractGraphics.patch(attract.name)?.canvas) : menu.screen;
    if(presentation){ctx.drawImage(presentation,0,0,320,200);return screen;}
    // Submit the current world before copying its GPU canvas into the wipe.
    renderer.render(scene,camera);
    const layers=[...document.querySelectorAll<HTMLCanvasElement>('#game canvas, body > canvas')]
      .filter(canvas=>canvas!==wipe.canvas&&!canvas.hidden&&getComputedStyle(canvas).display!=='none')
      .sort((a,b)=>(parseInt(getComputedStyle(a).zIndex)||0)-(parseInt(getComputedStyle(b).zIndex)||0));
    for(const layer of layers){const r=layer.getBoundingClientRect();if(r.width&&r.height)ctx.drawImage(layer,r.x/innerWidth*320,r.y/innerHeight*200,r.width/innerWidth*320,r.height/innerHeight*200);}
    return screen;
  }
  function beginWipe():void {wipe.begin(captureScreen());controls.setEnabled(false);}
  const menu=new GameMenu(session,wad,palette,{
    beginWipe,transitionBusy:()=>wipe.active,
    messages:enabled=>{messages.state.enabled=enabled;},
    save:saveGame,load:loadGame,slotLabel:slot=>slots.label(slot),
    changed:()=>{
      refreshAttract();
      controls.setEnabled(session.running&&!wipe.active&&!replay); ticks.advance(0,false,()=>{}); clock.getDelta();
      if(session.running || session.presenting || session.attracting) {
        if(session.running)renderer.domElement.focus();
        void audio.resume().then(()=>{if(session.attracting){if(attract.index===0)playMusic('D_INTRO');else if(attract.demo)playMusic(mapMusic(gameRules.episode,gameRules.map));}else if(session.running)playMusic(mapMusic(gameRules.episode,gameRules.map));else if(session.presenting)playMusic(menu.presentationMusic);}).catch(console.error);
        if(session.running && !touch) renderer.domElement.requestPointerLock()?.catch(()=>{});
        else if(document.pointerLockElement)document.exitPointerLock();
      } else {
        if(document.pointerLockElement) document.exitPointerLock();
        void audio.suspend().catch(console.error);
      }
    },
    newGame:(episode,skill)=>{beginWipe();attract.reset();clearRandom();loadLevel(episode,1,skill);},
    end:()=>{
      attract.reset();loadLevel(1,1,3); session.started=false; session.phase='level'; session.menu='main'; menu.refresh();
    },
    next:()=>{
      if(destination!==null)beginWipe();
      if(destination===null) { attract.reset();session.started=false; session.phase='level'; session.menu='main'; loadLevel(1,1,3); menu.refresh(); }
      else {loadLevel(gameRules.episode,destination,gameRules.skill,world.get(PlayerStatus)!);menu.start();}
    },
    volume:(musicVolume,soundVolume)=>{music.setVolume(musicVolume);setSoundVolume(soundVolume);}
  });
  attractView.addEventListener('pointerdown',event=>{event.preventDefault();menu.open();});
  const gameActions=document.createElement('div');gameActions.id='game-actions';
  gameActions.append(automap.button,document.getElementById('menu-button')!);
  document.body.append(gameActions);
  document.addEventListener('pointerlockchange',()=>{if(!touch && !document.pointerLockElement && session.running) menu.open();});
  window.addEventListener('blur',()=>{if(session.running || session.attracting) menu.open();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && (session.running || session.attracting)) menu.open();});
  document.addEventListener('keydown',event=>{if(event.code==='Enter' && session.running && !event.repeat)messages.refresh();});
  document.addEventListener('keypress',e=>{if(session.running) feedCheatChar(e.key,world.get(PlayerStatus)!);});
  const resize=()=>{camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();renderer.setSize(container.clientWidth,container.clientHeight);};
  window.addEventListener('resize',resize); screen.orientation?.addEventListener('change',resize);
  if(import.meta.env.DEV && new URLSearchParams(location.search).has('inspect')) {
    Object.defineProperty(window,'__doomReplay',{value:(name:string,limit=70)=>{
      if(wipe.active)throw Error('Wait for the screen transition before replaying');
      const lump=getLump(wad,name);if(!lump)throw Error('Demo lump not found');
      const demo=readDemo(wad.buf.slice(lump.offset,lump.offset+lump.size));
      clearRandom();loadLevel(demo.episode,demo.map,demo.skill);
      replay={demo,index:0,limit:Math.max(1,Math.min(4000,Math.trunc(limit)||70)),trace:[]};menu.start();controls.setEnabled(false);
    }});
    Object.defineProperty(window,'__doomInspect',{value:()=>({
      replay:replay?{tic:replay.index,length:replay.demo.commands.length,stopped:replay.stopped??null,trace:replay.trace}:null,
      attract:{active:session.attracting,stage:attract.name,remaining:attract.remaining,command:replay?.attract?replay.index:null},
      face:hud.faceIndex,
      wipe:wipe.inspect(),audio:audio.state,music:musicName,presentation:menu.inspectPresentation(), started:session.started,running:session.running, phase:session.phase,
      episode:gameRules.episode,map:gameRules.map,skill:gameRules.skill,tic:world.get(Time)!.levelTime,
      player:{x:level.player.mo.x,y:level.player.mo.y,z:level.player.mo.z,health:world.get(PlayerStatus)!.health,ammo:{...world.get(PlayerStatus)!.ammo}},
      input:{...world.get(Input)!},
      actors:allMobjs.map(mo=>({x:mo.x,y:mo.y,z:mo.z,health:mo.health,state:mo.state,tics:mo.tics})),
      sectors:level.map.sectors.map(s=>[s.floorHeight,s.ceilingHeight,s.lightLevel])
    })});
  }
  loading.style.display='none';
  renderer.setAnimationLoop(()=>{
    const dt=clock.getDelta();
    let time=world.get(Time)!;
    time.delta=0; time.elapsed=time.levelTime/35;
    controls.update();
    let finishPresentation=false;
    wipe.setPaused(!(session.running||session.presenting||session.attracting));
    ticks.advance(dt,session.running || session.presenting || session.attracting,()=>{
      if(advanceAttract)return;
      if(wipe.active){wipe.tick();if(!wipe.active)controls.setEnabled(session.running&&!replay);return;}
      if(session.attracting&&!attract.demo){advanceAttract=attract.tick();return;}
      if(session.presenting){finishPresentation=menu.tickPresentation() || finishPresentation;return;}
      if(!(session.running || session.attracting) || exitRequested!==null || world.get(PlayerStatus)!.playerState==='PST_REBORN') return;
      if(replay){
        const command=replay.demo.commands[replay.index];
        if(!command||replay.index>=replay.limit){if(replay.attract)advanceAttract=true;else menu.open();return;}
        world.set(Input,demoInput(command,level.player.mo.angle));replay.index++;
      }
      time.delta=1/35;
      playerTickSystem(world,()=>weapons.tick(world));
      // A_Punch can turn the player during weapon actions. Preserve that turn
      // in the browser controls as well as the next recorded tic command.
      const aimInput=world.get(Input)!;
      if(level.player.mo.angle!==aimInput.yaw+Math.PI/2){
        const yaw=level.player.mo.angle-Math.PI/2;
        controls.setInitialYaw(yaw,aimInput.pitch);world.set(Input,{yaw});
      }
      const tp=consumeTeleport();
      if(tp) {const yaw=tp.angle*Math.PI/180-Math.PI/2;controls.setInitialYaw(yaw);world.set(Input,{yaw});}
      advanceEnemyTic();
      const state=world.get(PlayerStatus)!; if(state.playerState==='PST_LIVE')level.player.mo.health=state.health;
      if(state.playerState==='PST_DEAD')automap.active=false;
      if((time.levelTime & 3) === 0) automap.discover(level.map,level.player,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));
      if(replay&&!replay.attract)replay.trace.push({
        tic:time.levelTime,random:archiveRandom().play,player:structuredClone(world.get(PlayerStatus)!),weapons:weapons.archive(),
        actors:allMobjs.map(m=>[m.type,m.x,m.y,m.z,m.momx,m.momy,m.momz,m.angle,m.health,m.state,m.tics,m.flags,m.target?allMobjs.indexOf(m.target):-1]),
        sectors:level.map.sectors.map(s=>[s.floorHeight,s.ceilingHeight,s.lightLevel,s.special]),
        sides:level.map.sidedefs.map(s=>[s.xoff,s.yoff,s.upper,s.middle,s.lower])
      });
      if(replay&&(state.playerState==='PST_REBORN'||exitRequested!==null)){
        if(replay.attract){advanceAttract=true;exitRequested=null;return;}
        replay.stopped=state.playerState==='PST_REBORN'?'rebirth':'level-exit';
        menu.open();
      }
      messages.tick();
      updateSpriteAnimations(1/35);hud.update(world);
    });
    if(advanceAttract)advanceAttractStage();
    if(finishPresentation)menu.finishPresentation();
    if(exitRequested!==null&&!replay?.stopped) {
      beginWipe();
      if(gameRules.map===9)world.get(PlayerStatus)!.didSecret=true;
      destination=nextMap(gameRules.episode,gameRules.map,exitRequested);exitRequested=null;
      menu.complete({didSecret:world.get(PlayerStatus)!.didSecret,episode:gameRules.episode,map:gameRules.map,next:destination,kills:level.kills,totalKills:level.totalKills,
        items:level.items,totalItems:level.things.filter(t=>COUNTED_ITEMS.has(t.type)).length,secrets:level.secrets,totalSecrets:level.totalSecrets,time:Math.floor(time.levelTime/35)});
    }
    if(session.started&&world.get(PlayerStatus)!.playerState==='PST_REBORN'&&!replay?.stopped){beginWipe();loadLevel(gameRules.episode,gameRules.map,gameRules.skill);menu.start();}
    time=world.get(Time)!;
    if(session.presenting && audio.state==='running')playMusic(menu.presentationMusic);
    cameraSystem(world);
    updateListener(level.player.mo,gameRules.map);
    if(dirtySectors.size) {level.manager.rebuildDirtySectors(dirtySectors);updateSpriteFloorHeights(level.sprites);clearDirtySectors();}
    setCameraPosition(level.player.mo.x,level.player.mo.y);
    level.manager.updateAnimatedTextures(time.levelTime);updateSpriteBillboards(level.sprites,camera.rotation.y);
    level.sky?.position.copy(camera.position);
    updateDoomLighting(world.get(PlayerStatus)!,weapons.extraLight);
    weaponOverlay.update(weapons,assets.sprites,level.map.sectors[level.player.mo.sectorIndex]?.lightLevel??255);
    renderer.render(scene,camera);
    automap.draw(level.map,level.player,!!world.get(PlayerStatus)!.powers.allmap,!!world.get(PlayerStatus)!.powers.invisibility);
    if(wipe.pending)wipe.finishCapture(captureScreen());
  });
}

main().catch(error=>{
  console.error(error);
  document.getElementById('loading')!.textContent=`Unable to start Doom: ${error.message}`;
});
