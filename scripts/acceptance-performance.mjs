// Desktop diagnostic baseline, not a substitute for physical mobile testing.
import {chromium} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {once} from 'node:events';
const seconds=Number(process.env.DOOM_PERF_SECONDS??120);
const channel=process.env.DOOM_PERF_CHANNEL||undefined;
const headless=process.env.DOOM_PERF_HEADED!=='1',webgl=process.env.DOOM_PERF_WEBGL!=='0';
if(!Number.isFinite(seconds)||seconds<60)throw Error('DOOM_PERF_SECONDS must be at least 60');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const budgets={frameP95ms:33.4,frameP99ms:50.1,maxBacklogSeconds:8/35,retainedHeapGrowthBytes:8*1024*1024,retainedNodeGrowth:50};
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3011','--strictPort'],{stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',d=>serverLog+=d);server.stderr.on('data',d=>serverLog+=d);
let browser;
try{
  for(let i=0;;i++){
    try{if((await fetch('http://127.0.0.1:3011')).ok)break;}catch{}
    if(i===299||server.exitCode!==null)throw Error(`Performance server failed: ${serverLog}`);
    await sleep(100);
  }
  browser=await chromium.launch({channel,headless,args:['--enable-unsafe-webgpu']});
  const browserSession=await browser.newBrowserCDPSession();
  const graphics=(await browserSession.send('SystemInfo.getInfo')).gpu;
  const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1});
  if(webgl)await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter(m=>['JSHeapUsedSize','Nodes','Documents'].includes(m.name)).map(m=>[m.name,m.value]));
  await page.goto('http://127.0.0.1:3011/?inspect');await page.locator('#loading').waitFor({state:'hidden'});
  const loads=[];
  for(let i=0;i<13;i++){
    const start=performance.now();await page.evaluate(()=>window.__doomReplay('DEMO1',1));
    await page.waitForFunction(()=>window.__doomInspect().replay.tic===1);
    await cdp.send('HeapProfiler.collectGarbage');
    loads.push({iteration:i,elapsedMs:performance.now()-start,...await metrics()});
  }
  console.log('Repeated-load retention: '+JSON.stringify(loads.map(({JSHeapUsedSize})=>JSHeapUsedSize)));
  // Three warm loads allow browser/shader caches to settle before measuring growth.
  const retained={heapBytes:loads.at(-1).JSHeapUsedSize-loads[3].JSHeapUsedSize,nodes:loads.at(-1).Nodes-loads[3].Nodes};
  await page.reload();await page.locator('#loading').waitFor({state:'hidden'});
  await page.evaluate(async()=>{
    const {TicClock}=await import('/src/game/TicClock.ts');const advance=TicClock.prototype.advance;
    window.__perf={frames:[],maxBacklog:0,maxClockBacklog:0,didGameTick:false};
    const {WeaponSystem}=await import('/src/game/Weapons.ts');const tick=WeaponSystem.prototype.tick;
    WeaponSystem.prototype.tick=function(world){window.__perf.didGameTick=true;return tick.call(this,world);};
    TicClock.prototype.advance=function(d,r,t){
      window.__perf.didGameTick=false;const n=advance.call(this,d,r,t);
      window.__perf.maxClockBacklog=Math.max(window.__perf.maxClockBacklog,this.accumulator);
      if(window.__perf.didGameTick)window.__perf.maxBacklog=Math.max(window.__perf.maxBacklog,this.accumulator);
      return n;
    };
    let last=0;function frame(now){if(last)window.__perf.frames.push(now-last);last=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
  });
  await page.getByRole('button',{name:'Watch demos',exact:true}).click();
  await sleep(10000);await page.evaluate(()=>{window.__perf.frames=[];window.__perf.maxBacklog=0;window.__perf.maxClockBacklog=0;});
  const samples=[];
  for(let elapsed=0;elapsed<seconds;){const wait=Math.min(10,seconds-elapsed);await sleep(wait*1000);elapsed+=wait;
    samples.push({elapsed,...await metrics(),scene:await page.evaluate(()=>{const s=window.__doomInspect();return {episode:s.episode,map:s.map,tic:s.tic,attract:s.attract};})});
    if(elapsed%30===0)console.log(`Performance sample ${elapsed}/${seconds}s`);
  }
  const data=await page.evaluate(()=>window.__perf);data.frames.sort((a,b)=>a-b);
  const percentile=p=>Number(data.frames[Math.min(data.frames.length-1,Math.floor(data.frames.length*p))].toFixed(3));
  const result={frameP50ms:percentile(.5),frameP95ms:percentile(.95),frameP99ms:percentile(.99),maxBacklogSeconds:data.maxBacklog,maxClockBacklogSeconds:data.maxClockBacklog,frames:data.frames.length};
  const passed=result.frameP95ms<=budgets.frameP95ms&&result.frameP99ms<=budgets.frameP99ms&&result.maxBacklogSeconds<=budgets.maxBacklogSeconds&&retained.heapBytes<=budgets.retainedHeapGrowthBytes&&retained.nodes<=budgets.retainedNodeGrowth&&errors.length===0;
  const report={scope:`${channel??'Bundled Chromium'}, ${headless?'headless':'headed'}, ${webgl?'forced WebGL':'default renderer'}, 960x720 DPR1. Real-time attract combat recordings; 13 same-map loads. JS heap/DOM only, not GPU memory or physical-device/audio-dropout evidence.`,graphics,date:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),browser:browser.version(),hardware:process.platform==='darwin'?execFileSync('sysctl',['-n','machdep.cpu.brand_string','hw.memsize'],{encoding:'utf8'}).trim():process.arch,os:process.platform==='darwin'?execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim():process.platform,seconds,budgets,result,retained,loads,samples,errors,passed};
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/performance-acceptance.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed,result,retained},null,2));if(!passed)process.exitCode=1;
}finally{
  await browser?.close();server.kill('SIGTERM');
  if(server.exitCode===null)await Promise.race([once(server,'close'),sleep(5000)]);
}
