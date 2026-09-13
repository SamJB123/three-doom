import { test, expect, type Page } from '@playwright/test';

const snapshot = (page: Page) => page.evaluate(() => (window as any).__doomInspect());
async function ready(page: Page) {
  await page.goto('/?inspect');
  await expect(page.getByRole('dialog', { name: 'Doom menu' })).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden();
}

async function startGame(page: Page, episode = 'Knee-Deep in the Dead') {
  await page.getByRole('button', {name:'New game',exact:true}).click();
  await page.getByRole('button', {name:episode,exact:true}).click();
  await page.getByRole('button', {name:'Hurt me plenty.',exact:true}).click();
  await expect(page.locator('#screen-wipe')).toBeHidden();
}

test('title, help, keyboard start, pause isolation, resume and end game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.screenshot({ path: 'artifacts/menu-title.png' });
  const title = await snapshot(page);
  expect(title.tic).toBe(0);
  await page.keyboard.press('Escape');
  expect((await snapshot(page)).started).toBe(false);
  await page.getByRole('button', { name: 'Read this', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter'); // New game
  await page.keyboard.press('Enter'); // Episode one
  await page.keyboard.press('Enter'); // Hurt me plenty
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.waitForFunction(() => (window as any).__doomInspect().tic > 5);
  await page.keyboard.down('KeyW');
  await page.keyboard.press('Escape');
  await page.keyboard.up('KeyW');
  await expect(page.getByRole('button', { name: 'Resume game' })).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).audio).toBe('suspended');
  const paused = await snapshot(page);
  await page.keyboard.press('ControlLeft');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  expect(await snapshot(page)).toEqual(paused);
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect((await snapshot(page)).tic).toBe(paused.tic);
  await page.getByRole('button', { name: 'Resume game' }).click();
  await page.waitForFunction(tic => (window as any).__doomInspect().tic > tic, paused.tic);
  expect((await snapshot(page)).input.forward).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button',{name:'Resume game',exact:true}).locator('canvas.doom-menu-label')).toBeVisible();
  await page.screenshot({ path: 'artifacts/menu-desktop.png' });
  await page.getByRole('button', { name: 'End game', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeVisible();
  expect((await snapshot(page)).started).toBe(false);
  expect(errors).toEqual([]);
});

test('confirmed new game resets the level without a page reload', async ({ page }) => {
  await ready(page);
  await startGame(page);
  await page.waitForFunction(() => (window as any).__doomInspect().tic > 5);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.evaluate(() => (window as any).__sentinel = 1);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByRole('button', { name: 'Knee-Deep in the Dead', exact: true }).click();
  await page.getByRole('button', { name: 'Hurt me plenty.', exact: true }).click();
  expect((await snapshot(page)).tic).toBeLessThan(10);
  expect(await page.evaluate(() => (window as any).__sentinel)).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeVisible();
  expect((await snapshot(page)).started).toBe(false);
});

test('touch menu button pauses and resumes without held fire', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3010', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await ready(page);
  await page.getByRole('button', { name: 'New game', exact: true }).tap();
  await page.getByRole('button', { name: 'Knee-Deep in the Dead', exact: true }).tap();
  await page.getByRole('button', { name: 'Hurt me plenty.', exact: true }).tap();
  await page.waitForFunction(() => (window as any).__doomInspect().tic > 2);
  await page.evaluate(() => {
    const zone = [...document.querySelectorAll('div')].find(el => el.style.zIndex === '-1')!;
    const touch = new Touch({ identifier: 42, target: zone, clientX: 330, clientY: 650 });
    zone.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], changedTouches: [touch], bubbles: true }));
  });
  await page.waitForFunction(() => (window as any).__doomInspect().input.attack);
  await page.getByRole('button', { name: 'Open menu' }).tap();
  await expect.poll(async () => (await snapshot(page)).audio).toBe('suspended');
  const paused = await snapshot(page);
  await page.waitForTimeout(150);
  expect(await snapshot(page)).toEqual(paused);
  await page.screenshot({ path: 'artifacts/menu-touch.png' });
  await page.getByRole('button', { name: 'Resume game' }).tap();
  await page.waitForFunction(tic => (window as any).__doomInspect().tic > tic, paused.tic);
  expect((await snapshot(page)).input.attack).toBe(false);
  await context.close();
});

test('missing WAD reports a useful startup error', async ({ page }) => {
  await page.route('**/doomu.wad', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/');
  await expect(page.locator('#loading')).toContainText('public/doomu.wad');
});

// Exercises real level teardown/load, routing and menu integration. Exit is
// requested via the game module; this is not a claim of a combat playthrough.
test('all four episodes load and traverse normal, secret and finale routes', async ({page}) => {
  test.setTimeout(240_000);
  const errors: string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  await ready(page);
  const episodes=['Knee-Deep in the Dead','The Shores of Hell','Inferno','Thy Flesh Consumed'];
  const secretFrom=[3,5,6,2];
  let visited=0;
  for(let episode=1;episode<=4;episode++) {
    await startGame(page,episodes[episode-1]);
    let map=1, secretVisited=false;
    while(true) {
      const state=await snapshot(page);
      expect(state.episode).toBe(episode); expect(state.map).toBe(map); expect(state.running).toBe(true);
      visited++;
      const secret=map===secretFrom[episode-1] && !secretVisited;
      if(secret) secretVisited=true;
      await page.evaluate(async secret=>{
        const module=await import('/src/game/UseAction.ts'); module.requestExit(secret);
      },secret);
      await expect.poll(async()=>(await snapshot(page)).phase).not.toBe('level');
      await expect(page.locator('#screen-wipe')).toBeHidden();
      const next=map===8 ? null : secret ? 9 : map===9 ? [0,4,6,7,3][episode] : map+1;
      if(next===null) {await page.getByRole('button',{name:'Return to title',exact:true}).click();break;}
      await page.getByRole('button',{name:'Show totals',exact:true}).click();
      await page.getByRole('button',{name:`Continue to E${episode}M${next}`,exact:true}).click();
      await page.getByRole('button',{name:`Enter E${episode}M${next}`,exact:true}).click();
      await expect.poll(async()=>(await snapshot(page)).map).toBe(next);
      await expect(page.locator('#screen-wipe')).toBeHidden();
      map=next;
    }
  }
  expect(visited).toBe(36); expect(errors).toEqual([]);
});

test('E1M1 thinker loop moves an alerted monster and automap keeps simulation running',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);await startGame(page);
  // Controlled non-ambush spawn in the real start room. E1M1's medium-skill
  // enemies are all ambush-flagged and correctly ignore shots out of sight.
  await page.evaluate(async()=>{
    const {allMobjs,spawnMapThing}=await import('/src/game/Mobj.ts');
    const player=allMobjs.find(m=>m.type==='MT_PLAYER')!;
    spawnMapThing({type:3004,x:player.x/65536+96,y:player.y/65536,angle:180,flags:7});
  });
  const before=await snapshot(page);
  await page.keyboard.down('ControlLeft');
  await expect.poll(async()=>(await snapshot(page)).player.ammo.clip).toBeLessThan(before.player.ammo.clip);
  await page.keyboard.up('ControlLeft');
  await expect.poll(async()=>{
    const state=await snapshot(page);
    return state.actors.some((actor:any,i:number)=>before.actors[i] &&
      Math.hypot(actor.x-before.actors[i].x,actor.y-before.actors[i].y)>8*65536);
  },{timeout:8000}).toBe(true);
  await page.keyboard.press('Tab');await expect(page.locator('#automap')).toBeVisible();
  const tic=(await snapshot(page)).tic;
  await expect.poll(async()=>(await snapshot(page)).tic).toBeGreaterThan(tic+5);
  await page.screenshot({path:'artifacts/automap.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#automap')).toBeHidden();
  await expect(page.getByRole('dialog',{name:'Doom menu'})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#automap')).toBeVisible();
  await page.keyboard.press('Tab');await expect(page.locator('#automap')).toBeHidden();
  expect(errors).toEqual([]);
});

test('save slots survive reload and restore the paused world, weapon ammo and simulation tic',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await ready(page);await startGame(page);
  await page.keyboard.down('ControlLeft');
  await expect.poll(async()=>(await snapshot(page)).player.ammo.clip).toBeLessThan(50);
  await page.keyboard.up('ControlLeft');
  await page.keyboard.press('Escape');
  const saved=await snapshot(page);
  await page.getByRole('button',{name:'Save game',exact:true}).click();
  await page.getByRole('button',{name:'Save slot 1: Empty',exact:true}).click();
  await expect(page.getByRole('button',{name:'Resume game',exact:true})).toBeVisible();
  await page.reload();await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button',{name:'Load game',exact:true}).click();
  await page.getByRole('button',{name:/^Load slot 1: E1M1/}).click();
  const loaded=await snapshot(page);
  for(const key of ['player','actors','sectors','tic','map','episode','skill'])expect(loaded[key]).toEqual(saved[key]);
  expect(loaded.running).toBe(false);
  await page.getByRole('button',{name:'Resume game',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).tic).toBeGreaterThan(saved.tic+5);
  await page.keyboard.press('Escape');
  const beforeCorrupt=await snapshot(page);
  await page.evaluate(()=>localStorage.setItem('three-doom.save.v1.1','{"format":"broken"}'));
  await page.getByRole('button',{name:'Load game',exact:true}).click();
  await page.getByRole('button',{name:'Load slot 2: Unavailable save',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('damaged or incompatible');
  expect((await snapshot(page)).tic).toBe(beforeCorrupt.tic);
  expect((await snapshot(page)).player).toEqual(beforeCorrupt.player);
  expect(errors).toEqual([]);
});

test('exit switch starts full intermission music/stats/map sequence and loads next level',async({page})=>{
  await ready(page);await startGame(page);
  // Exercise the actual E1M1 exit linedef dispatch; movement to the switch is
  // covered separately from this presentation/lifecycle acceptance test.
  await page.evaluate(async()=>{
    const {getMobjMapData}=await import('/src/game/Mobj.ts');
    const {useSpecialLine}=await import('/src/game/UseAction.ts');
    const map=getMobjMapData()!;useSpecialLine(map.linedefs.find(line=>line.special===11)!,map);
  });
  await expect.poll(async()=>(await snapshot(page)).phase).toBe('intermission');
  await expect.poll(async()=>(await snapshot(page)).music).toBe('D_INTER');
  await expect(page.locator('#screen-wipe')).toBeHidden();
  const tic=(await snapshot(page)).tic;
  await page.getByRole('button',{name:'Show totals',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue to E1M2',exact:true})).toBeVisible();
  await page.screenshot({path:'artifacts/intermission-stats.png'});
  expect((await snapshot(page)).tic).toBe(tic);
  await page.getByRole('button',{name:'Continue to E1M2',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).presentation.phase).toBe('next');
  await page.screenshot({path:'artifacts/intermission-map.png'});
  await page.keyboard.press('Escape');
  const paused=await snapshot(page);await page.waitForTimeout(150);expect(await snapshot(page)).toEqual(paused);
  await page.getByRole('button',{name:'Resume game',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).map,{timeout:8000}).toBe(2);
  expect((await snapshot(page)).running).toBe(true);
  await expect.poll(async()=>(await snapshot(page)).music).toBe('D_E1M2');
});

test('all episode finales reveal original text then art, including timed bunny panorama',async({page})=>{
  await ready(page);
  const result=await page.evaluate(async()=>{
    const {parseWAD,parsePalette}=await import('/src/wad/index.ts');
    const {WadGraphics}=await import('/src/menu/WadGraphics.ts');
    const {Finale}=await import('/src/menu/Finale.ts');
    const {FINALE_TEXT}=await import('/src/menu/FinaleText.ts');
    const wad=parseWAD(await (await fetch('/doomu.wad')).arrayBuffer());
    const graphics=new WadGraphics(wad,parsePalette(wad));
    const expected=document.createElement('canvas');expected.width=320;expected.height=200;
    const ctx=expected.getContext('2d')!;
    function artwork(name:string){ctx.clearRect(0,0,320,200);graphics.draw(ctx,name,0,0);return expected.toDataURL();}
    const outcomes=[];
    for(let episode=1;episode<=4;episode++){
      const finale=new Finale(episode,graphics);
      const blank=finale.canvas.toDataURL();
      for(let tic=0;tic<40;tic++)finale.tick();
      const revealsText=finale.canvas.toDataURL()!==blank;
      const end=FINALE_TEXT[episode-1].length*3+251;
      for(let tic=40;tic<end;tic++)finale.tick();
      const matchesArt=finale.canvas.toDataURL()===artwork(['CREDIT','VICTORY2','PFUB1','ENDPIC'][episode-1]);
      let panorama=true,ending=true;
      if(episode===3){
        for(let tic=0;tic<870;tic++)finale.tick();
        panorama=finale.canvas.toDataURL()===artwork('PFUB2');
        for(let tic=870;tic<1210;tic++)finale.tick();
        artwork('PFUB2');graphics.draw(ctx,'END6',108,68);
        ending=finale.canvas.toDataURL()===expected.toDataURL();
      }
      outcomes.push({revealsText,matchesArt,panorama,ending,music:finale.music});
    }
    return outcomes;
  });
  expect(result).toEqual([1,2,3,4].map(episode=>({revealsText:true,matchesArt:true,panorama:true,ending:true,music:episode===3?'D_BUNNY':'D_VICTOR'})));
});

test('masked walls render transparent holes without opposite-face interference',async({page})=>{
  await ready(page);
  const pixels=await page.evaluate(async()=>{
    const {SceneManager}=await import('/src/renderer/SceneBuilder.ts');
    const {WebGPURenderer,Scene,OrthographicCamera}=await import('/tests/browser/three.ts');
    const rgba=new Uint8Array(64*64*4),indices=new Uint8Array(64*64),palette=new Uint8Array(768);palette[0]=255;
    for(let y=0;y<64;y++)for(let x=0;x<32;x++)rgba[(y*64+x)*4+3]=255;
    const sectors=[0,1].map(()=>({floorHeight:0,ceilingHeight:64,floorTex:'-',ceilingTex:'-',lightLevel:255,special:0,tag:0}));
    const sides=[0,1].map(sector=>({sector,xoff:0,yoff:0,upper:'-',lower:'-',middle:'GRATE'}));
    const manager=new SceneManager([{x:0,y:0},{x:64,y:0}],[{v1:0,v2:1,right:0,left:1,flags:4,special:0,tag:0}],sides,sectors,{GRATE:{width:64,height:64,rgba,indices}},{},Array.from({length:32},()=>new Uint8Array(256)),palette);
    const renderer=new WebGPURenderer({forceWebGL:true,antialias:false});renderer.setSize(128,128);renderer.setClearColor(0x0000ff);await renderer.init();
    const scene=new Scene();scene.add(manager.root);
    const camera=new OrthographicCamera(-1.5,1.5,1.5,-1.5,.1,100);
    const copy=document.createElement('canvas');copy.width=128;copy.height=128;
    const context=copy.getContext('2d')!;const results=[];
    for(const z of [5,-5]){
      camera.position.set(1,1,z);camera.lookAt(1,1,0);renderer.render(scene,camera);
      context.drawImage(renderer.domElement,0,0);
      results.push([Array.from(context.getImageData(42,64,1,1).data),Array.from(context.getImageData(85,64,1,1).data)]);
    }
    manager.dispose();renderer.dispose();return results;
  });
  expect(pixels).toEqual([0,1].map(()=>[[255,0,0,255],[0,0,255,255]]));
});

test('mobile action hints match touch hit areas and top-right buttons never overlap',async({browser})=>{
  const context=await browser.newContext({baseURL:'http://127.0.0.1:3010',viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();await ready(page);await startGame(page);
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    const map=await page.locator('#automap-button').boundingBox(),menu=await page.locator('#menu-button').boundingBox();
    expect(map!.x+map!.width+8).toBeLessThanOrEqual(menu!.x);
    expect(menu!.x+menu!.width).toBeLessThanOrEqual(viewport.width);
    const bounds=await page.locator('#touch-controls').boundingBox();
    for(const action of ['sprint','fire'] as const){
      const hint=await page.locator(`[data-touch-action="${action}"]`).boundingBox();
      expect(hint!.width).toBeCloseTo(hint!.height,1);expect(hint!.width).toBeGreaterThanOrEqual(80);
      expect(hint!.y).toBeGreaterThan(bounds!.height/2);expect(hint!.y+hint!.height).toBeLessThan(bounds!.height);
      expect(await page.locator(`[data-touch-action="${action}"]`).evaluate(el=>getComputedStyle(el).borderRadius)).toBe('50%');
      const x=hint!.x+hint!.width/2,y=hint!.y+hint!.height/2;
      async function touchAt(y:number,type='touchstart',touchX=x){
        await page.evaluate(({x,y,type})=>{
          const target=document.elementFromPoint(x,y)!;
          if(target.id!=='touch-input-zone')throw new Error(`Touch zone obscured by ${target.id||target.tagName}`);
          const touch=new Touch({identifier:71,target,clientX:x,clientY:y});
          target.dispatchEvent(new TouchEvent(type,{touches:type==='touchstart'?[touch]:[],changedTouches:[touch],bubbles:true}));
        },{x:touchX,y,type});
      }
      await touchAt(y);
      await expect.poll(async()=>(await snapshot(page)).input[action==='sprint'?'run':'attack']).toBe(true);
      await touchAt(y,'touchend');
      await expect.poll(async()=>(await snapshot(page)).input[action==='sprint'?'run':'attack']).toBe(false);
      const outside=action==='sprint'?hint!.y+hint!.height+8:hint!.y-8;
      await touchAt(outside);await page.waitForTimeout(70);
      expect((await snapshot(page)).input[action==='sprint'?'run':'attack']).toBe(false);
      await touchAt(outside,'touchcancel');
      // Inside the bounding square but outside its circular edge.
      await touchAt(hint!.y+2,'touchstart',hint!.x+2);await page.waitForTimeout(70);
      expect((await snapshot(page)).input[action==='sprint'?'run':'attack']).toBe(false);
      await touchAt(hint!.y+2,'touchcancel',hint!.x+2);
    }
    await page.screenshot({path:`artifacts/touch-zones-${viewport.width}.png`});
  }
  await context.close();
});

test('pickup HUD uses WAD glyphs, pauses its timeout, refreshes and obeys message options',async({page})=>{
  await ready(page);await startGame(page);
  const pickup=()=>page.evaluate(async()=>{
    const {allMobjs,spawnMobj}=await import('/src/game/Mobj.ts');
    const player=allMobjs.find(m=>m.type==='MT_PLAYER')!;spawnMobj(player.x,player.y,player.z,'MT_SHOTGUN');
  });
  await pickup();await expect(page.getByRole('status')).toHaveText('You got the shotgun!');
  await expect(page.locator('#hud-message')).toBeVisible();
  await page.screenshot({path:'artifacts/pickup-message.png'});
  await page.keyboard.press('Escape');await page.waitForTimeout(4200);
  await expect(page.getByRole('status')).toHaveText('You got the shotgun!');
  await page.getByRole('button',{name:'Resume game',exact:true}).click();
  await expect(page.locator('#hud-message')).toBeHidden({timeout:6000});
  await page.keyboard.press('Enter');await expect(page.locator('#hud-message')).toBeVisible();
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Options',exact:true}).click();
  await page.getByRole('button',{name:'Messages: ON',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Resume game',exact:true}).click();
  await expect(page.locator('#hud-message')).toBeHidden({timeout:6000});
  await page.evaluate(async()=>{const {allMobjs,spawnMobj}=await import('/src/game/Mobj.ts');const player=allMobjs.find(m=>m.type==='MT_PLAYER')!;spawnMobj(player.x,player.y,player.z,'MT_CHAINGUN');});
  await page.waitForTimeout(200);await expect(page.locator('#hud-message')).toBeHidden();
});

test('E1M1 armor pedestal scrolling walls share source tic phase through pause and rebuild',async({page})=>{
  await ready(page);
  await page.evaluate(async()=>{
    const {SceneManager}=await import('/src/renderer/SceneBuilder.ts');
    const update=SceneManager.prototype.updateAnimatedTextures;
    SceneManager.prototype.updateAnimatedTextures=function(tic:number){
      update.call(this,tic);
      const records:any[]=[];
      this.root.traverse((object:any)=>{
        const uv=object.geometry?.getAttribute('uv');
        for(const record of object.geometry?.userData.scrolls??[])records.push({offset:record.side.xoff,u:uv.getX(record.start),end:uv.getX(record.start+1),span:record.span,phase:record.phase});
      });
      (window as any).__scrollCheck={tic,records};
      (window as any).__rebuildScroll=()=>this.rebuildDirtySectors(new Set([41]));
    };
  });
  await startGame(page);
  await page.evaluate(async()=>{
    const {allMobjs}=await import('/src/game/Mobj.ts');
    const player=allMobjs.find(m=>m.type==='MT_PLAYER')!;
    player.x=-224*65536;player.y=-3320*65536;player.z=player.floorz=104*65536;player.ceilingz=264*65536;player.momx=player.momy=0;
  });
  const check=async()=>{
    const {tic,records}=await page.evaluate(()=>(window as any).__scrollCheck);
    expect(records).toHaveLength(8);
    for(const r of records){
      expect(r.offset).toBe(8+tic);
      expect(r.u).toBe(Math.fround(((8+tic)%128)/128+r.phase));
      expect(r.end).toBeCloseTo(r.u+r.span,6);
    }
    const ordered=[...records].sort((a,b)=>a.phase-b.phase);
    for(let i=0;i<ordered.length;i++){
      const next=ordered[(i+1)%ordered.length];
      const difference=ordered[i].end-next.u;
      expect(difference).toBeCloseTo(Math.round(difference),6);
    }
    return {tic,records};
  };
  await expect.poll(async()=>(await page.evaluate(()=>(window as any).__scrollCheck))?.tic??0).toBeGreaterThan(10);
  await check();await page.keyboard.press('Escape');
  const paused=await check();await page.waitForTimeout(150);expect(await check()).toEqual(paused);
  await page.evaluate(()=>(window as any).__rebuildScroll());await page.waitForTimeout(100);expect(await check()).toEqual(paused);
  await page.getByRole('button',{name:'Resume game',exact:true}).click();
  await expect.poll(async()=>(await page.evaluate(()=>(window as any).__scrollCheck)).tic).toBeGreaterThan(paused.tic);
  await check();await page.screenshot({path:'artifacts/e1m1-armor-scroll.png'});
});

test('death keeps the corpse until Use, then rebirth resets the level in process',async({page})=>{
  await ready(page);await startGame(page);
  await page.evaluate(async()=>{
    const {allMobjs}=await import('/src/game/Mobj.ts');const {damageMobj}=await import('/src/game/Attack.ts');
    damageMobj(allMobjs.find(m=>m.type==='MT_PLAYER')!,null,null,250);
  });
  await expect.poll(async()=>(await snapshot(page)).player.health).toBe(0);
  await page.waitForTimeout(3300);
  expect((await snapshot(page)).player.health).toBe(0);expect((await snapshot(page)).running).toBe(true);
  await page.keyboard.press('Escape');const paused=await snapshot(page);
  await page.waitForTimeout(150);expect((await snapshot(page)).tic).toBe(paused.tic);
  await page.getByRole('button',{name:'Resume game',exact:true}).click();
  await page.keyboard.down('KeyE');
  await expect.poll(async()=>(await snapshot(page)).player.health).toBe(100);
  await page.keyboard.up('KeyE');
  expect((await snapshot(page)).player.ammo.clip).toBe(50);
  expect((await snapshot(page)).running).toBe(true);
  await expect(page.locator('#screen-wipe')).toBeHidden();
  const x=(await snapshot(page)).player.y;await page.keyboard.down('KeyW');
  await expect.poll(async()=>(await snapshot(page)).player.y).not.toBe(x);
  await page.keyboard.up('KeyW');
});

test('exit melt captures the world, freezes gameplay and presentation, and pauses with the menu',async({page})=>{
  await ready(page);await startGame(page);
  await page.evaluate(async()=>{const {requestExit}=await import('/src/game/UseAction.ts');requestExit(false);});
  await expect(page.locator('#screen-wipe')).toBeVisible();
  const start=await snapshot(page);
  expect(start.phase).toBe('intermission');expect(start.wipe.active).toBe(true);
  await page.waitForTimeout(100);
  const during=await snapshot(page);expect(during.tic).toBe(start.tic);expect(during.presentation.tic).toBe(start.presentation.tic);
  expect(during.wipe.columns).not.toEqual(start.wipe.columns);
  const colors=await page.locator('#screen-wipe').evaluate((canvas:HTMLCanvasElement)=>{
    const pixels=canvas.getContext('2d')!.getImageData(0,0,320,200).data;
    return new Set(Array.from({length:320*200},(_,i)=>`${pixels[i*4]},${pixels[i*4+1]},${pixels[i*4+2]}`)).size;
  });
  expect(colors).toBeGreaterThan(20);
  await page.screenshot({path:'artifacts/exit-melt.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#screen-wipe')).toBeHidden();
  const paused=await snapshot(page);await page.waitForTimeout(200);expect((await snapshot(page)).wipe).toEqual(paused.wipe);
  await page.getByRole('button',{name:'Resume game',exact:true}).click();
  await expect(page.locator('#screen-wipe')).toBeHidden({timeout:4000});
  await expect.poll(async()=>(await snapshot(page)).presentation.tic).toBeGreaterThan(start.presentation.tic);
  expect((await snapshot(page)).tic).toBe(start.tic);
});

test('sound effects cannot unpause audio and are stopped when leaving a level',async({page})=>{
  await ready(page);await startGame(page);await page.keyboard.press('Escape');
  await expect.poll(async()=>(await snapshot(page)).audio).toBe('suspended');
  await page.evaluate(async()=>{
    const create=AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource=function(){
      const source=create.call(this),stop=source.stop.bind(source);
      source.stop=(when?:number)=>{(window as any).__effectStopped=true;stop(when);};
      return source;
    };
    const {playSound}=await import('/src/sound/SoundManager.ts');playSound('pistol');
  });
  await page.waitForTimeout(150);expect((await snapshot(page)).audio).toBe('suspended');
  await page.getByRole('button',{name:'End game',exact:true}).click();await page.getByRole('button',{name:'Confirm',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__effectStopped)).toBe(true);
  expect((await snapshot(page)).started).toBe(false);
});

test('sky covers steep views and sky ceilings/boundaries occlude distant rooms',async({page})=>{
  const errors:string[]=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await ready(page);
  const results=await page.evaluate(async()=>{
    const {createSky}=await import('/src/renderer/SkyRenderer.ts');
    const {SceneManager}=await import('/src/renderer/SceneBuilder.ts');
    const {WebGPURenderer,Scene,PerspectiveCamera,Mesh,BoxGeometry,MeshBasicMaterial}=await import('/tests/browser/three.ts');
    const rgba=new Uint8Array(256*128*4);for(let i=0;i<rgba.length;i+=4)rgba.set([0,255,0,255],i);
    const data={width:256,height:128,rgba,indices:new Uint8Array(256*128)};
    const sky=createSky(data),scene=new Scene();scene.add(sky.mesh);
    const renderer=new WebGPURenderer({forceWebGL:true,antialias:false});renderer.setSize(64,64);renderer.setClearColor(0xff00ff);await renderer.init();
    const camera=new PerspectiveCamera(90,1,.1,500),copy=document.createElement('canvas');copy.width=copy.height=64;const ctx=copy.getContext('2d')!;
    const draw=()=>{sky.mesh.position.copy(camera.position);renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,0);return Array.from(ctx.getImageData(32,32,1,1).data);};
    const views=[];
    for(const pitch of [-89,-60,0,60,89]){
      camera.position.set(25,40,-60);const angle=pitch*Math.PI/180;camera.lookAt(25,40+Math.sin(angle),-60-Math.cos(angle));draw();
      const pixels=ctx.getImageData(0,0,64,64).data;views.push(Array.from(pixels).every((v,i)=>v===[0,255,0,255][i%4]));
    }
    const vertices=[[-64,-64],[64,-64],[64,64],[-64,64]].map(([x,y])=>({x,y}));
    const sides=vertices.map(()=>({sector:0,xoff:0,yoff:0,upper:'-',middle:'-',lower:'-'}));
    const lines=vertices.map((_,i)=>({v1:i,v2:(i+1)%4,right:i,left:-1,flags:0,special:0,tag:0}));
    const manager=new SceneManager(vertices,lines,sides,[{floorHeight:0,ceilingHeight:64,floorTex:'-',ceilingTex:'F_SKY1',lightLevel:255,special:0,tag:0}],{},{},Array.from({length:32},()=>new Uint8Array(256)),new Uint8Array(768),data);scene.add(manager.root);
    const room=new Mesh(new BoxGeometry(20,1,20),new MeshBasicMaterial({color:0xff0000}));room.position.y=4;scene.add(room);
    camera.position.set(0,1,0);camera.lookAt(0,5,0);const ceiling=draw();
    room.scale.set(.2,4,.1);room.position.set(0,3,-5);camera.position.set(0,3,0);camera.lookAt(0,3,-5);const boundary=draw();
    room.scale.z=.025;room.position.z=-1;const foreground=draw();
    manager.dispose();room.geometry.dispose();room.material.dispose();renderer.dispose();
    return {views,ceiling,boundary,foreground};
  });
  expect(errors).toEqual([]);
  expect(results.views).toEqual([true,true,true,true,true]);
  expect(results.ceiling).toEqual([0,255,0,255]);expect(results.boundary).toEqual([0,255,0,255]);
  expect(results.foreground).toEqual([255,0,0,255]);
});

test('mobile taps use doors and holding the aiming side opens an owned-weapon wheel',async({browser})=>{
  const context=await browser.newContext({baseURL:'http://127.0.0.1:3010',viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();await ready(page);
  await page.evaluate(async()=>{
    const {TouchControls}=await import('/src/renderer/TouchControls.ts');const update=TouchControls.prototype.update;
    TouchControls.prototype.update=function(){update.call(this);(window as any).__touch=this;};
  });
  await startGame(page);
  const door=await page.evaluate(async()=>{
    const {getMobjMapData,allMobjs}=await import('/src/game/Mobj.ts');const {PlayerStatus}=await import('/src/ecs/traits.ts');
    const map=getMobjMapData()!,line=map.linedefs.find(line=>line.special===1&&line.left>=0&&map.sectors[map.sidedefs[line.left].sector].ceilingHeight===map.sectors[map.sidedefs[line.left].sector].floorHeight)!;
    const a=map.vertexes[line.v1],b=map.vertexes[line.v2],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),front=map.sidedefs[line.right].sector;
    const player=allMobjs.find(m=>m.type==='MT_PLAYER')!;player.x=((a.x+b.x)/2+dy/length*24)*65536;player.y=((a.y+b.y)/2-dx/length*24)*65536;
    player.z=player.floorz=map.sectors[front].floorHeight*65536;player.ceilingz=map.sectors[front].ceilingHeight*65536;player.sectorIndex=front;player.momx=player.momy=player.momz=0;
    (window as any).__touch.setInitialYaw(Math.atan2(dx,-dy)-Math.PI/2);
    const state=(window as any).__touch.world.get(PlayerStatus);state.godMode=true;
    return {sector:map.sidedefs[line.left].sector,height:map.sectors[map.sidedefs[line.left].sector].ceilingHeight};
  });
  const gesture=async(type:string,x=285,y=430)=>{
    await page.evaluate(({type,x,y})=>{
      const target=document.getElementById('touch-input-zone')!,touch=new Touch({identifier:81,target,clientX:x,clientY:y});
      target.dispatchEvent(new TouchEvent(type,{touches:type==='touchend'||type==='touchcancel'?[]:[touch],changedTouches:[touch],bubbles:true}));
    },{type,x,y});
  };
  await gesture('touchstart');await gesture('touchend');
  await expect.poll(async()=>(await snapshot(page)).sectors[door.sector][1]).toBeGreaterThan(door.height);
  await gesture('touchstart');await expect(page.locator('#weapon-wheel')).toBeVisible();
  await expect(page.locator('#weapon-wheel button')).toHaveCount(2);
  expect(await page.locator('#weapon-wheel [data-weapon="shotgun"]').count()).toBe(0);
  const aiming=await snapshot(page);const fist=await page.locator('#weapon-wheel [data-weapon="fist"]').boundingBox();
  await gesture('touchmove',fist!.x+fist!.width/2,fist!.y+fist!.height/2);
  expect((await snapshot(page)).input.yaw).toBe(aiming.input.yaw);expect((await snapshot(page)).input.attack).toBe(false);
  await page.screenshot({path:'artifacts/mobile-weapon-wheel.png'});
  await gesture('touchend',fist!.x+fist!.width/2,fist!.y+fist!.height/2);await expect(page.locator('#weapon-wheel')).toBeHidden();
  await expect.poll(async()=>page.evaluate(async()=>{
    const {PlayerStatus}=await import('/src/ecs/traits.ts');return (window as any).__touch.world.get(PlayerStatus).currentWeapon;
  })).toBe('fist');
  // Moving the aiming thumb cancels the hold; cancellation cannot become Use.
  await gesture('touchstart');await gesture('touchmove',320,430);await page.waitForTimeout(500);await expect(page.locator('#weapon-wheel')).toBeHidden();await gesture('touchcancel',320,430);
  await gesture('touchstart');await expect(page.locator('#weapon-wheel')).toBeVisible();await gesture('touchcancel');await expect(page.locator('#weapon-wheel')).toBeHidden();
  await page.evaluate(async()=>{
    const {PlayerStatus}=await import('/src/ecs/traits.ts');const state=(window as any).__touch.world.get(PlayerStatus);
    for(const weapon of Object.keys(state.weapons))state.weapons[weapon]=weapon!=='supershotgun';
  });
  await gesture('touchstart');await expect(page.locator('#weapon-wheel')).toBeVisible();
  await expect(page.locator('#weapon-wheel button')).toHaveCount(8);
  const boxes=await page.locator('#weapon-wheel button').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];expect(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y).toBe(true);
  }
  await page.screenshot({path:'artifacts/mobile-weapon-wheel-full.png'});
  await page.getByRole('button',{name:'Open menu',exact:true}).tap();await expect(page.locator('#weapon-wheel')).toBeHidden();
  expect((await snapshot(page)).input.use).toBe(false);expect((await snapshot(page)).input.attack).toBe(false);
  await context.close();
});
