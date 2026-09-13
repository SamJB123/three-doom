// Compare existing browser traces against freshly executed original C runs.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const limit=Number(process.argv[2]??350),demos=process.argv.slice(3);
if(!demos.length)demos.push('DEMO1','DEMO2','DEMO3','DEMO4');
if(!Number.isInteger(limit)||limit<1||limit>4000||demos.some(d=>!/^DEMO[1-4]$/.test(d)))throw Error('Usage: node scripts/verify-world.mjs [1–4000 tics] [DEMO1 ... DEMO4]');
const results=[];
for(const demo of demos){
  const dir=resolve('artifacts/world-comparisons',demo.toLowerCase());mkdirSync(dir,{recursive:true});
  const run=spawnSync(process.execPath,['scripts/reference-world.mjs',demo,String(limit)],{encoding:'utf8'});
  writeFileSync(join(dir,'reference.log'),(run.stdout??'')+(run.stderr??''));
  if(run.status!==0){results.push({demo,passed:false,error:'Original C runner failed; see reference.log'});continue;}
  const compare=spawnSync(process.execPath,['--import','tsx','scripts/compare-world.ts','--check'],{encoding:'utf8',maxBuffer:8*1024*1024});
  writeFileSync(join(dir,'compare.log'),(compare.stdout??'')+(compare.stderr??''));
  for(const file of ['trace.jsonl','provenance.json'])copyFileSync(resolve('artifacts/reference-world',file),join(dir,file));
  // A failed comparison process may not have produced a new report.
  let report;
  try{report=JSON.parse(compare.stdout);}catch{results.push({demo,passed:false,error:'Comparison failed; see compare.log'});continue;}
  copyFileSync(resolve('artifacts/reference-world/comparison.json'),join(dir,'comparison.json'));
  copyFileSync(resolve(`artifacts/port-${demo.toLowerCase()}-trace.json`),join(dir,'port-trace.json'));
  const first=[...Object.values(report.firstByField),report.firstActor,report.firstWorld].filter(Boolean).sort((a,b)=>a.tic-b.tic)[0];
  results.push({demo,passed:compare.status===0,compared:report.compared,first});
}
writeFileSync(resolve('artifacts/world-comparisons/summary.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
