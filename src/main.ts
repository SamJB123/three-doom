import { WebGPURenderer, PerspectiveCamera, Scene, Clock } from 'three/webgpu';
import { createWorld as createECSWorld } from 'koota';
import {
  parseWAD, getMapLumps,
  parseVertexes, parseLinedefs, parseSidedefs, parseSectors, parseThings,
  parseSegs, parseSubsectors, parseNodes,
  parsePalette, parseFlats, parseTextures, parseSprites,
  parseColormap, parseBlockmap
} from './wad';
import { buildScene } from './renderer/SceneBuilder';
import { createSky } from './renderer/SkyRenderer';
import { buildThingSprites, updateSpriteBillboards, updateSpriteAnimations, updateSpriteFloorHeights } from './renderer/SpriteRenderer';
import { FPSControls } from './renderer/FPSControls';
import { TouchControls } from './renderer/TouchControls';
import { createPlayer, findSectorAt, setCrossSpecialCallback } from './physics/DoomMovement';
import type { DoomMapData } from './physics/DoomMovement';
import { intToFixed, fixedToFloat, FRACUNIT } from './math/fixed';
import {
  Time, Input, DoomWorld, Camera, IsPlayer, Position, Rotation, PlayerStatus
} from './ecs/traits';
import { playerMovementSystem, cameraSystem } from './ecs/systems';
import { crossSpecialLine, hasDirtySectors, dirtySectors, clearDirtySectors, spawnLightSpecials, consumeTeleport } from './game';
import { checkPickups } from './game/Pickups';
import { WeaponSystem } from './game/Weapons';
import { parseSounds, initSoundManager, MusicPlayer, updateListener } from './sound';
import { getLump } from './wad';
import { StatusBar } from './hud/StatusBar';
import { WeaponOverlay } from './hud/WeaponOverlay';
import { initMobjSystem, spawnMapThing, spawnPlayerMissile, setCameraPosition } from './game/Mobj';
import { computeSectorSoundOrigins } from './game/SectorHelpers';
import { DOOMEDNUM_TO_TYPE } from './game/MobjData';
import { initAttackSystem, setAttackMap, lineAttack, setPlayerDamageCallback, setPlayerDamageMobjCallback } from './game/Attack';
import { radiusAttackPlayer, damagePlayer } from './game/PlayerDamage';
import { feedCheatChar } from './game/Cheats';
import { initEnemyAI, setPlayerMobj, advanceEnemyTic } from './game/EnemyAI';
import { setExitCallback } from './game/UseAction';
import type { Mobj } from './game/Mobj';
import { MF_SOLID, MF_SHOOTABLE } from './game/MobjData';

const SCALE = 1.0 / 32.0;

async function main(): Promise<void> {

  const loadingEl = document.getElementById( 'loading' )!;

  // ---- Parse WAD ----
  loadingEl.textContent = 'Fetching WAD...';
  const response = await fetch( 'doomu.wad' );
  const buffer = await response.arrayBuffer();

  loadingEl.textContent = 'Parsing WAD...';
  await new Promise( r => setTimeout( r, 0 ) );
  const wad = parseWAD( buffer );

  loadingEl.textContent = 'Parsing assets...';
  await new Promise( r => setTimeout( r, 0 ) );
  const palette = parsePalette( wad );
  const colormap = parseColormap( wad );
  const flats = parseFlats( wad, palette );
  const wallTextures = parseTextures( wad, palette );

  const spriteFrames = parseSprites( wad, palette );

  console.log( `Parsed ${ Object.keys( flats ).length } flats, ${ Object.keys( wallTextures ).length } wall textures, ${ Object.keys( spriteFrames ).length } sprites` );
  console.log( `Parsed ${ colormap.length } colormap tables` );

  // ---- Parse sounds ----
  loadingEl.textContent = 'Parsing sounds...';
  await new Promise( r => setTimeout( r, 0 ) );
  const audioCtx = new AudioContext();
  const sfxBuffers = await parseSounds( wad, audioCtx );
  initSoundManager( audioCtx, sfxBuffers );
  console.log( `Parsed ${ Object.keys( sfxBuffers ).length } sound effects` );

  // ---- Setup HUD ----
  const statusBar = new StatusBar();
  statusBar.loadGraphics( wad, palette );
  const weaponOverlay = new WeaponOverlay();

  // ---- Setup weapon system ----
  const weaponSystem = new WeaponSystem();

  // ---- Parse music ----
  const musicPlayer = new MusicPlayer( audioCtx );

  const genmidiLump = getLump( wad, 'GENMIDI' );
  const musLump = getLump( wad, 'D_E1M1' );

  if ( genmidiLump ) {

    // Pass raw GENMIDI lump bytes to the OPL3 emulator
    const genmidiBytes = wad.buf.slice( genmidiLump.offset, genmidiLump.offset + genmidiLump.size ).buffer;
    musicPlayer.setGenmidiData( genmidiBytes );
    console.log( `Loaded GENMIDI lump: ${ genmidiLump.size } bytes` );

  }

  let musData: ArrayBuffer | null = null;

  if ( musLump ) {

    musData = wad.buf.slice( musLump.offset, musLump.offset + musLump.size ).buffer;
    console.log( `Loaded D_E1M1 lump: ${ musLump.size } bytes` );

  }

  // ---- Parse map ----
  loadingEl.textContent = 'Parsing E1M1...';
  await new Promise( r => setTimeout( r, 0 ) );
  const mapLumps = getMapLumps( wad, 'E1M1' );
  const vertexes = parseVertexes( wad, mapLumps.VERTEXES );
  const linedefs = parseLinedefs( wad, mapLumps.LINEDEFS );
  const sidedefs = parseSidedefs( wad, mapLumps.SIDEDEFS );
  const sectors = parseSectors( wad, mapLumps.SECTORS );
  const things = parseThings( wad, mapLumps.THINGS );
  const segs = parseSegs( wad, mapLumps.SEGS );
  const subsectors = parseSubsectors( wad, mapLumps.SSECTORS );
  const nodes = parseNodes( wad, mapLumps.NODES );
  const blockmap = parseBlockmap( wad, mapLumps.BLOCKMAP );

  console.log( `E1M1: ${ vertexes.length } verts, ${ linedefs.length } linedefs, ${ sectors.length } sectors` );
  console.log( `BSP: ${ nodes.length } nodes, ${ subsectors.length } subsectors, ${ segs.length } segs` );
  console.log( `Blockmap: ${ blockmap.columns }x${ blockmap.rows } grid` );

  // Precompute sector sound origins for spatial audio
  computeSectorSoundOrigins( sectors, linedefs, sidedefs, vertexes );

  // Assemble map data for Doom movement
  const map: DoomMapData = {
    vertexes, linedefs, sidedefs, sectors,
    segs, subsectors, nodes, blockmap
  };

  // Spawn sector light specials (flickering, strobing, glowing)
  spawnLightSpecials( sectors, linedefs, sidedefs );

  // ---- Setup renderer ----
  loadingEl.textContent = 'Initializing renderer...';
  await new Promise( r => setTimeout( r, 0 ) );

  // The #game container fills the space above the status bar via flexbox.
  // Size the renderer to match it so the 3D scene isn't obscured by the HUD.
  const gameContainer = document.getElementById( 'game' )!;

  const getViewport = () => ( {
    w: gameContainer.clientWidth,
    h: gameContainer.clientHeight
  } );

  const renderer = new WebGPURenderer( { antialias: true } );
  const vp = getViewport();
  renderer.setSize( vp.w, vp.h );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setClearColor( 0x000000 );
  gameContainer.appendChild( renderer.domElement );

  await renderer.init();

  const scene = new Scene();
  const camera = new PerspectiveCamera( 90, vp.w / vp.h, 0.1, 500 );

  // Build visible geometry
  const { group, manager } = buildScene( vertexes, linedefs, sidedefs, sectors, things, wallTextures, flats, colormap, palette );
  scene.add( group );

  // Build sky
  const skyTex = wallTextures[ 'SKY1' ];
  let skyGroup: ReturnType<typeof createSky>['mesh'] | null = null;

  if ( skyTex ) {

    const sky = createSky( skyTex );
    skyGroup = sky.mesh;
    scene.add( skyGroup );
    renderer.setClearColor( sky.topColor );

  }

  // Build thing sprites (decorations, pickups, enemies, etc.)
  // Skip types managed by the mobj system (barrels, enemies)
  const mobjDoomedNums = new Set( Object.keys( DOOMEDNUM_TO_TYPE ).map( Number ) );
  const spriteGroup = buildThingSprites( things, spriteFrames, map, mobjDoomedNums );
  scene.add( spriteGroup );

  // ---- Setup mobj system (barrels, enemies, projectiles) ----
  initMobjSystem( spriteFrames, spriteGroup, map );
  initAttackSystem();
  setAttackMap( map );

  // Spawn barrels (and later enemies) as live mobjs with state machines
  for ( const thing of things ) {

    if ( DOOMEDNUM_TO_TYPE[ thing.type ] ) {

      spawnMapThing( thing );

    }

  }

  // Setup walk-over trigger callback (player ref set after player creation below)
  let crossPlayer: ReturnType<typeof createPlayer> | null = null;
  setCrossSpecialCallback( ( lineIdx: number ) => {

    crossSpecialLine( map.linedefs[ lineIdx ], map, crossPlayer ?? undefined, things );

  } );

  // ---- Setup Doom player ----
  const p1 = things.find( t => t.type === 1 );
  const spawnX = p1 ? p1.x : 0;
  const spawnY = p1 ? p1.y : 0;
  const startYaw = p1 ? ( p1.angle * Math.PI ) / 180 - Math.PI / 2 : 0;

  // Find spawn sector via BSP to get floor height
  const spawnSector = findSectorAt( spawnX, spawnY, map );
  const spawnFloor = spawnSector ? spawnSector.floorHeight : 0;

  const doomPlayer = createPlayer( spawnX, spawnY, spawnFloor );
  crossPlayer = doomPlayer;

  if ( spawnSector ) {

    doomPlayer.mo.ceilingz = intToFixed( spawnSector.ceilingHeight );

  }

  // Set player facing angle (Doom angle: 0=east, stored as radians)
  doomPlayer.mo.angle = p1 ? ( p1.angle * Math.PI ) / 180 : 0;

  console.log( `Player spawned at Doom (${ spawnX }, ${ spawnY }) floor=${ spawnFloor }` );

  // ---- Setup enemy AI ----
  initEnemyAI();
  setPlayerMobj( doomPlayer.mo );

  // ---- Setup exit callback ----
  setExitCallback( ( secret ) => {

    console.log( secret ? 'SECRET EXIT!' : 'EXIT!' );
    // For now, reload the level — future: load next map
    setTimeout( () => window.location.reload(), 1500 );

  } );

  // ---- Setup ECS ----
  const world = createECSWorld( Time, Input );
  world.add( DoomWorld );
  world.set( DoomWorld, {
    player: doomPlayer,
    map
  } );
  world.add( Camera );
  world.set( Camera, { camera } );
  world.add( PlayerStatus );
  weaponSystem.setup( world.get( PlayerStatus )! );

  // Wire weapon fire to hitscan attack system
  weaponSystem.setFireCallback( ( angle, slope, damage ) => {

    // Shoot from player eye height
    const shootZ = doomPlayer.viewz;
    lineAttack( doomPlayer.mo.x, doomPlayer.mo.y, shootZ, angle, slope, ( 32 * 64 ) * FRACUNIT, damage, null );

  } );

  // Wire projectile weapon fire (rocket, plasma, BFG)
  weaponSystem.setMissileCallback( ( angle, typeName ) => {

    spawnPlayerMissile( doomPlayer, angle, typeName );

  } );

  // Wire explosion damage to player
  setPlayerDamageCallback( ( spot, source, damage ) => {

    const pState = world.get( PlayerStatus );
    if ( pState ) radiusAttackPlayer( doomPlayer, pState, spot, source, damage );

  } );

  // Wire enemy melee/hitscan damage → player (when damageMobj target is player)
  setPlayerDamageMobjCallback( ( damage, _inflictor, _source ) => {

    const pState = world.get( PlayerStatus );
    if ( pState ) damagePlayer( pState, damage );

  } );

  // Spawn player entity (ECS representation for camera sync)
  world.spawn(
    IsPlayer,
    Position( {
      x: spawnX * SCALE,
      y: doomPlayer.viewz * SCALE,
      z: - spawnY * SCALE
    } ),
    Rotation( { yaw: startYaw, pitch: 0 } )
  );

  // Setup controls — touch on mobile, pointer lock on desktop
  const isTouch = TouchControls.isTouchDevice();
  const controls = isTouch
    ? new TouchControls( world )
    : new FPSControls( renderer.domElement, world );
  controls.setInitialYaw( startYaw );

  // Hide the controls that don't apply to this device
  const infoEl = document.getElementById( 'info' )!;
  const hideClass = isTouch ? 'desktop-only' : 'touch-only';
  for ( const el of infoEl.querySelectorAll( `.${ hideClass }` ) ) {

    ( el as HTMLElement ).style.display = 'none';

  }

  // Dismiss overlay and start game on first click/tap.
  // The overlay covers the screen, so it must handle the initial gesture itself.
  const startGame = () => {

    infoEl.classList.add( 'hidden' );

    audioCtx.resume().then( () => {

      if ( musData && ! musicPlayer.isPlaying() ) {

        musicPlayer.play( musData );

      }

    } );

    if ( ! isTouch ) renderer.domElement.requestPointerLock();

    infoEl.removeEventListener( 'click', startGame );
    infoEl.removeEventListener( 'touchstart', startGame );

  };

  infoEl.addEventListener( isTouch ? 'touchstart' : 'click', startGame );

  // Cheat code listener
  document.addEventListener( 'keypress', ( e: KeyboardEvent ) => {

    const pState = world.get( PlayerStatus );
    if ( pState ) feedCheatChar( e.key, pState );

  } );

  // Resize handler — also listen for orientationchange on mobile
  const onResize = () => {

    const v = getViewport();
    camera.aspect = v.w / v.h;
    camera.updateProjectionMatrix();
    renderer.setSize( v.w, v.h );

  };

  window.addEventListener( 'resize', onResize );
  screen.orientation?.addEventListener( 'change', onResize );

  loadingEl.style.display = 'none';

  // ---- Game loop ----
  const clock = new Clock();
  let weaponTicAccum = 0;
  const TIC_SEC = 1 / 35;

  renderer.setAnimationLoop( () => {

    const dt = Math.min( clock.getDelta(), 1 / 30 ); // cap delta

    // Update ECS time — mutate in place to preserve levelTime across frames
    const time = world.get( Time )!;
    time.delta = dt;
    time.elapsed = clock.elapsedTime;

    // Check for reborn — reload level
    const pStateLoop = world.get( PlayerStatus );
    if ( pStateLoop && pStateLoop.playerState === 'PST_REBORN' ) {

      window.location.reload();
      return;

    }

    // Gather input
    controls.update();

    // Run systems
    playerMovementSystem( world );
    cameraSystem( world );

    // Sync audio listener to camera position and facing
    updateListener(
      camera.position.x, camera.position.y, camera.position.z,
      - Math.sin( camera.rotation.y ), - Math.cos( camera.rotation.y )
    );

    // Check for pending teleport and sync camera yaw
    const tp = consumeTeleport();
    if ( tp ) {

      const newYaw = ( tp.angle * Math.PI ) / 180 - Math.PI / 2;
      controls.setInitialYaw( newYaw );

    }

    // Run weapon system at 35Hz
    weaponTicAccum += dt;
    const weaponTics = Math.min( Math.floor( weaponTicAccum / TIC_SEC ), 4 );
    weaponTicAccum -= weaponTics * TIC_SEC;

    for ( let i = 0; i < weaponTics; i ++ ) {

      weaponSystem.tick( world );
      advanceEnemyTic();

    }

    // Apply weapon bob from player movement
    weaponSystem.applyBob( doomPlayer.bob, world.get( Time )!.levelTime );

    // Sync health: player Mobj ↔ PlayerStatus (ECS)
    const pState = world.get( PlayerStatus );
    if ( pState ) {

      doomPlayer.mo.health = pState.health;

    }

    // Check for item pickups
    checkPickups( world, spriteGroup, doomPlayer.mo.x, doomPlayer.mo.y, doomPlayer.mo.z );

    // Rebuild only dirty sectors (doors/platforms/floors)
    if ( hasDirtySectors() ) {

      manager.rebuildDirtySectors( dirtySectors );
      updateSpriteFloorHeights( spriteGroup );
      clearDirtySectors();

    }

    // Update camera position for mobj sprite rotation selection
    setCameraPosition( doomPlayer.mo.x, doomPlayer.mo.y );

    // Animate textures and sprites
    manager.updateAnimatedTextures( Math.floor( clock.elapsedTime * 35 ) );
    updateSpriteAnimations( dt );
    updateSpriteBillboards( spriteGroup, camera.rotation.y );

    // Track sky to camera — centered on player so it appears infinitely far.
    // Y tracks too so the horizon line stays correct relative to the eye.
    if ( skyGroup ) {

      skyGroup.position.set( camera.position.x, camera.position.y, camera.position.z );

    }

    // Update weapon overlay
    weaponOverlay.update( weaponSystem, spriteFrames );

    // Update HUD
    statusBar.update( world );

    // Render
    renderer.render( scene, camera );

  } );

}

main().catch( err => {

  console.error( err );
  document.getElementById( 'loading' )!.innerHTML = `<span style="color:red">${ err.message }<br><pre>${ err.stack }</pre></span>`;

} );
