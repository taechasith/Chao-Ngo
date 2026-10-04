import {writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const account='c24fed68f8dc59cc339bd821d215bba8',root='https://api.cloudflare.com/client/v4',name=`chao-ngo-qa-cleanup-${process.env.GITHUB_RUN_ID}`;
const secret=randomBytes(32).toString('base64url');console.log(`::add-mask::${secret}`);
const report={scope:'Cleanup only exact test resources',results:[]};await mkdir('qa-results',{recursive:true});
async function cf(path,method='GET',body){const r=await fetch(root+path,{method,headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok||j.success===false)throw new Error(`Cleanup API ${r.status} ${(j.errors||[]).map(x=>x.code).join(',')}`);return j.result;}
function cli(args,input){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{input,encoding:'utf8',env:process.env});if(r.status!==0)throw new Error(`Wrangler cleanup ${args[0]} failed`);}
let created=false;
try{
 const allowed=['chao-ngo-qa-37225275417','chao-ngo-qa-37225634301','chao-ngo-qa-37225183463'];
 const buckets=(await cf(`/accounts/${account}/r2/buckets`)).buckets.filter(b=>allowed.includes(b.name));
 if(buckets.length){
 const code=`export default {async fetch(req,env){if(req.method!=='POST'||req.headers.get('Authorization')!=='Bearer '+env.QA_CLEANUP_TOKEN)return new Response('Unauthorized',{status:401});const result=[];for(const binding of ${JSON.stringify(buckets.map((_,i)=>'QA'+i))}){let n=0;for(;;){const page=await env[binding].list({limit:1000});if(!page.objects.length)break;await env[binding].delete(page.objects.map(o=>o.key));n+=page.objects.length;}result.push({binding,removed:n});}return Response.json(result);}};`;
 await writeFile('qa-cleanup-worker.mjs',code);
 await writeFile('qa-cleanup-wrangler.json',JSON.stringify({name,account_id:account,main:'qa-cleanup-worker.mjs',compatibility_date:'2026-09-19',workers_dev:true,routes:[],r2_buckets:buckets.map((b,i)=>({binding:'QA'+i,bucket_name:b.name}))}));
 cli(['secret','put','QA_CLEANUP_TOKEN','--config','qa-cleanup-wrangler.json'],secret+'\n');created=true;cli(['deploy','--config','qa-cleanup-wrangler.json']);
 const domain=(await cf(`/accounts/${account}/workers/subdomain`)).subdomain;let cleared=false;
 for(let i=0;i<12;i++){const r=await fetch(`https://${name}.${domain}.workers.dev`,{method:'POST',headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(60000)});if(r.ok){report.objects=await r.json();cleared=true;break;}if(r.status!==404)throw new Error(`Cleanup Worker ${r.status}`);await new Promise(r=>setTimeout(r,5000));}
 if(!cleared)throw new Error('Cleanup Worker unavailable');
 for(const b of buckets){await cf(`/accounts/${account}/r2/buckets/${b.name}`,'DELETE');report.results.push({bucket:b.name,status:'removed'});}
 }
 report.status='pass';
}catch(e){report.status='failed';report.failure=e.message;process.exitCode=1;}
finally{if(created){try{await cf(`/accounts/${account}/workers/scripts/${name}`,'DELETE');report.cleanupWorker='removed';}catch(e){report.cleanupWorker=e.message;process.exitCode=1;}}await writeFile('qa-results/cleanup.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
