// Requires a running development server (npm run dev -- --port 3010).
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
const scenes=[['DEMO1',70],['DEMO2',350],['DEMO3',900],['DEMO4',368]];
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'chrome',args:['--enable-unsafe-webgpu']});
const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));mkdirSync('artifacts/reference-views',{recursive:true});
try{
  await page.goto((process.env.DOOM_VIEW_URL??'http://127.0.0.1:3010')+'/?inspect');
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.evaluate(async()=>{const {TicClock}=await import('/src/game/TicClock.ts');const advance=TicClock.prototype.advance;TicClock.prototype.advance=function(d,r,t){return advance.call(this,d*16,r,t);};});
  await page.addStyleTag({content:'#doom-menu,#game-actions{visibility:hidden!important}'});
  for(const [demo,tic]of scenes){
    const prefix=`artifacts/reference-views/${demo}-${tic}`;
    await page.evaluate(({demo,tic})=>window.__doomReplay(demo,tic),{demo,tic});
    await page.waitForFunction(t=>window.__doomInspect().replay.tic===t,tic);
    await page.waitForTimeout(600);await page.screenshot({path:prefix+'-port.png'});
    const output=execFileSync(process.execPath,['scripts/reference-world.mjs',demo,String(tic)],{encoding:'utf8',env:{...process.env,DOOM_REFERENCE_RENDER:prefix+'-c.ppm'}});
    writeFileSync(prefix+'-reference.log',output);copyFileSync('artifacts/reference-world/provenance.json',prefix+'-provenance.json');
    const ppm=readFileSync(prefix+'-c.ppm'),rgb=ppm.subarray(ppm.indexOf('\n255\n')+5);
    const png=await page.evaluate(encoded=>{
      const raw=atob(encoded),canvas=document.createElement('canvas');canvas.width=320;canvas.height=200;
      const context=canvas.getContext('2d'),pixels=context.createImageData(320,200);
      for(let i=0;i<320*200;i++){for(let c=0;c<3;c++)pixels.data[i*4+c]=raw.charCodeAt(i*3+c);pixels.data[i*4+3]=255;}
      context.putImageData(pixels,0,0);return canvas.toDataURL('image/png').split(',')[1];
    },rgb.toString('base64'));
    writeFileSync(prefix+'-c.png',Buffer.from(png,'base64'));console.log(`Captured ${demo} tic ${tic}`);
  }
  if(errors.length)throw Error(errors.join('\n'));
  writeFileSync('artifacts/reference-views/capture.json',JSON.stringify({scenes,browser:browser.version(),viewport:[960,600],scope:'Matching commands and paused heading. Source base palette/world renderer; HUD tickers not advanced. Projection/rasterization differ.'},null,2));
}finally{await browser.close();}
