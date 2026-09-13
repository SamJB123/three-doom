// Deterministic diagnostics use Playwright's version-pinned headless Chromium.
// Branded macOS Chrome can leave Crashpad holding stderr after browser exit.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const demos=process.argv.slice(2);
if(demos.some(name=>!/^DEMO[1-4]$/.test(name)))throw Error('Usage: npm run test:replay -- [DEMO1 ... DEMO4]');
const env={...process.env,PLAYWRIGHT_BROWSER:'chromium',DOOM_TRACE_DEMOS:demos.length?demos.join(','):process.env.DOOM_TRACE_DEMOS??'DEMO1,DEMO2,DEMO3,DEMO4',DOOM_TRACE_TICS:process.env.DOOM_TRACE_TICS??'4000',DOOM_TRACE_SPEED:process.env.DOOM_TRACE_SPEED??'8'};
delete env.PLAYWRIGHT_CHANNEL;
console.log('Replay diagnostics: Playwright bundled Chromium; '+env.DOOM_TRACE_DEMOS);
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/playwright/cli.js',import.meta.url)),'test','--grep','original IWAD demo'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env,stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??1;if(signal)console.error('Replay runner stopped by '+signal);});
