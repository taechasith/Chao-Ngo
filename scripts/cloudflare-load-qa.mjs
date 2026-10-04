import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHmac,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const account='c24fed68f8dc59cc339bd821d215bba8',api='https://api.cloudflare.com/client/v4';
const run=process.env.GITHUB_RUN_ID||'manual';
if(!/^\d+$/.test(run))throw new Error('Run only from GitHub Actions');
const name=`chao-ngo-qa-${run}`,dbName=name,bucketName=name;
const report={scope:'Remote Cloudflare Worker/D1/R2, D1 overload fix candidate application code, real Better Auth session verification; synthetic QA identities, NOT 300 Google OAuth logins',source:process.env.GITHUB_SHA,run,startedAt:new Date().toISOString(),phases:[],requests:[],resources:{worker:name,database:dbName,bucket:bucketName},cleanup:[]};
let dbId,origin,createdWorker=false,createdBucket=false,users=[],uploads=[],tailProcess;
report.cloudflareExceptions=[];
const secret=randomBytes(48).toString('base64url');
console.log(`::add-mask::${secret}`);
await mkdir('qa-results',{recursive:true});
const persist=async()=>writeFile('qa-results/results.json',JSON.stringify(report,null,2));
async function cf(path,method='GET',body){
 const r=await fetch(api+path,{method,headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const j=await r.json();if(!r.ok||j.success===false)throw new Error(`Cloudflare ${method} ${path.split('/').slice(-2).join('/')} failed HTTP ${r.status} codes ${(j.errors||[]).map(x=>x.code).join(',')}`);return j.result;
}
const query=async sql=>{for(let retry=0;;retry++){try{return (await cf(`/accounts/${account}/d1/database/${dbId}/query`,'POST',{sql,params:[]}))[0]?.results||[];}catch(e){if(!/^SELECT/i.test(sql)||retry>=3||!e.message.includes('429'))throw e;await new Promise(r=>setTimeout(r,1000*2**retry));}}};
const q=x=>`'${String(x).replaceAll("'","''")}'`;
function cli(args,input){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8',input,env:{...process.env,WRANGLER_LOG_PATH:`${process.env.RUNNER_TEMP}/chao-ngo-qa.log`},maxBuffer:20*1024*1024});if(r.status!==0){console.log((r.stderr||r.stdout).slice(-3000));throw new Error(`Wrangler ${args.slice(0,2).join(' ')} failed`);}console.log((r.stdout||'').slice(-2500));return r.stdout;}
function signed(token){return '__Secure-better-auth.session_token='+encodeURIComponent(token+'.'+createHmac('sha256',secret).update(token).digest('base64'));}
let inflight=0,peak=0,r2Slots=0;const r2Waiters=[];
async function withR2Slot(work){if(r2Slots>=10)await new Promise(resolve=>r2Waiters.push(resolve));else r2Slots++;try{return await work();}finally{const next=r2Waiters.shift();if(next)next();else r2Slots--;}}
async function request(user,path,method='GET',body){
 const begin=performance.now();inflight++;peak=Math.max(peak,inflight);
 try {const r=await fetch(origin+path,{method,headers:{Origin:origin,...(user?{Cookie:user.cookie}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
 const raw=await r.text();const payload=(()=>{try{return JSON.parse(raw)}catch{return null}})();report.requests.push({phase:report.phase,user:user?.id,path:path.replace(/[a-f0-9-]{36}/g,':id'),status:r.status,ms:Math.round(performance.now()-begin),code:payload?.code,...([404,500].includes(r.status)?{diagnostic:raw.slice(0,220),contentType:r.headers.get('content-type')}: {})});return {status:r.status,body:payload};}
 catch(e){report.requests.push({phase:report.phase,user:user?.id,status:'network-error',ms:Math.round(performance.now()-begin),error:e.name});throw new Error(e.name);}
 finally{inflight--;}
}
function check(value,expected,label){if(value!==expected)throw new Error(`${label}: expected ${expected}, got ${value}`);}
function pct(xs,p){return [...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1]||0;}
async function phase(name,pool,work){report.phase=name;peak=0;const begin=performance.now(),durations=[],errors=[];await Promise.all(pool.map(async user=>{const t=performance.now();try{await work(user);}catch(e){errors.push({user:user.id,error:e.message});}durations.push(Math.round(performance.now()-t));}));const row={name,users:pool.length,successful:pool.length-errors.length,errors,elapsedMs:Math.round(performance.now()-begin),peakHttpInflight:peak,p50Ms:pct(durations,.5),p95Ms:pct(durations,.95),p99Ms:pct(durations,.99)};report.phases.push(row);console.log(JSON.stringify(row));await persist();if(errors.length){report.partialFailure=true;users=users.filter(u=>!errors.some(e=>e.user===u.id));if(!users.length)throw new Error(`${name} failed for all users`);}}
try{
 const subdomain=(await cf(`/accounts/${account}/workers/subdomain`)).subdomain;
 if(!subdomain)throw new Error('Existing workers.dev subdomain unavailable');origin=`https://${name}.${subdomain}.workers.dev`;report.origin=origin;
 dbId=(await cf(`/accounts/${account}/d1/database`,'POST',{name:dbName,primary_location_hint:'apac'})).uuid;report.resources.databaseId=dbId;await persist();
 await cf(`/accounts/${account}/r2/buckets`,'POST',{name:bucketName});createdBucket=true;
 const base=JSON.parse((await readFile('wrangler.jsonc','utf8')).replace(/^\s*\/\/.*$/mg,''));
 const config={...base,name,routes:[],workers_dev:true,triggers:{crons:[]},vars:{BETTER_AUTH_URL:origin},d1_databases:[{binding:'DB',database_name:dbName,database_id:dbId,migrations_dir:'./migrations'}],r2_buckets:[{binding:'PUBLIC_ASSETS',bucket_name:bucketName},{binding:'PRIVATE_UPLOADS',bucket_name:bucketName}]};
 await writeFile('wrangler.qa.json',JSON.stringify(config));
 cli(['d1','migrations','apply','DB','--remote','--config','wrangler.qa.json']);
 await query("UPDATE app_metadata SET value='true' WHERE key='research_collection_enabled'");
 users=Array.from({length:300},(_,i)=>{const token=randomUUID();console.log(`::add-mask::${token}`);return {id:`remote-qa-${run}-${String(i).padStart(3,'0')}`,token,cookie:signed(token)};});
 const now=Date.now();
 await query(`INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES ${users.map(u=>`(${q(u.id)},'CLOUDFLARE SYNTHETIC QA',${q(u.id+'@example.test')},1,${now},${now})`).join(',')}`);
 await query(`INSERT INTO session (id,token,userId,expiresAt,createdAt,updatedAt) VALUES ${users.map(u=>`(${q(randomUUID())},${q(u.token)},${q(u.id)},${now+3600000},${now},${now})`).join(',')}`);
 await query(`INSERT INTO consent_records (id,user_id,consent_version,data_notice_version,research_participation,ai_chat_upload_consent) VALUES ${users.map(u=>`(${q(randomUUID())},${q(u.id)},'2026-09-21.1','2026-09-21.1',1,0)`).join(',')}`);
 const build=spawnSync('npm',['run','build'],{stdio:'inherit',env:process.env});if(build.status!==0)throw new Error('Build failed');
 const generated=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
 Object.assign(generated,{name,routes:[],workers_dev:true,triggers:{crons:[]},vars:{BETTER_AUTH_URL:origin},d1_databases:[{binding:'DB',database_name:dbName,database_id:dbId}],r2_buckets:config.r2_buckets});
 await writeFile('dist/server/wrangler.qa.json',JSON.stringify(generated));
 // Secret upload creates only the new QA worker; never modify production secrets.
 cli(['secret','put','BETTER_AUTH_SECRET','--config','dist/server/wrangler.qa.json'],secret+'\n');createdWorker=true;
 cli(['deploy','--config','dist/server/wrangler.qa.json']);
 tailProcess=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','tail','--format','json','--config','dist/server/wrangler.qa.json'],{env:process.env,stdio:['ignore','pipe','ignore']});
 let tailBuffer='',tailJson='';report.tailEvents=0;
 const captureTail=event=>{report.tailEvents++;for(const ex of event.exceptions||[]){if(report.cloudflareExceptions.length<30)report.cloudflareExceptions.push({name:ex.name,message:String(ex.message).slice(0,500)});}for(const log of event.logs||[]){const msg=(log.message||[]).join(' ');if(/D1_|SQLITE|overload|queue|exceeded/i.test(msg)&&report.cloudflareExceptions.length<30)report.cloudflareExceptions.push({name:log.level,message:msg.slice(0,500)});}};
 tailProcess.stdout.on('data',chunk=>{tailBuffer+=chunk.toString();let pos;while((pos=tailBuffer.indexOf('\n'))>=0){const line=tailBuffer.slice(0,pos);tailBuffer=tailBuffer.slice(pos+1);if(line==='{'||tailJson){tailJson+=line+'\n';if(line==='}'){try{captureTail(JSON.parse(tailJson));}catch{}tailJson='';}}else{try{captureTail(JSON.parse(line));}catch{}}}});
 // Allow the new worker to become available; bounded readiness, not counted as load.
 for(let i=0;i<12;i++){const r=await request(null,'/api/submissions');if(r.status===401)break;if(i===11)throw new Error('QA endpoint not ready');await new Promise(r=>setTimeout(r,2000));}
 // Record a 30-second propagation/warm-up window before measured traffic. No measured failure is retried.
 report.phase='deployment propagation warmup';
 for(let round=0;round<6;round++){await Promise.all(Array.from({length:5},()=>request(null,'/api/submissions')));await new Promise(r=>setTimeout(r,5000));}
 delete report.phase;
 const unauth=await request(null,'/api/submissions');check(unauth.status,401,'Unauthenticated guard');
 const sanity=await request(users[0],'/api/auth/get-session');check(sanity.status,200,'Signed session sanity status');check(sanity.body?.user?.id,users[0].id,'Signed session sanity identity');
 await phase('300 concurrent start/resume draft',users,async u=>{const r=await request(u,'/api/submissions','POST',{subgameId:'subgame-ka-fintech'});check(r.status,201,'start');u.draft=r.body.submission;});
 await phase('300 concurrent players autosave 8 answers and read them back',users,async(u)=>{
 for(const question of u.draft.answerForm.questions){const value=question.key==='submission_mode'?'text':`[CLOUDFLARE QA] ${u.id}: ${question.key}`;check((await request(u,`/api/questionnaire-sessions/${u.draft.answerForm.sessionId}/responses`,'PUT',{questionId:question.id,value})).status,200,'save');}
 const r=await request(u,'/api/submissions?subgameId=subgame-ka-fintech');check(r.status,200,'read');check(r.body.submission.submissionId,u.draft.submissionId,'owner submission');for(const question of u.draft.answerForm.questions){check(r.body.submission.answerForm.responses[question.id],question.key==='submission_mode'?'text':`[CLOUDFLARE QA] ${u.id}: ${question.key}`,'stored answer');}
 });
 // Disconnect 10 clients while writing to the remote Worker, then reconnect/retry.
 await phase('10 remote transport interruptions and retry recovery',users.slice(0,10),async u=>{
 const question=u.draft.answerForm.questions.find(q=>q.key==='case_truth_model');
 u.recoveredValue=`[CLOUDFLARE QA] ${u.id}: reconnect edit`;
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),150);let interrupted=false;
 try{const r=await fetch(origin+`/api/questionnaire-sessions/${u.draft.answerForm.sessionId}/responses`,{method:'PUT',headers:{Origin:origin,Cookie:u.cookie,'Content-Type':'application/json'},body:JSON.stringify({questionId:question.id,value:u.recoveredValue}),signal:ctrl.signal});await r.text();}catch(e){if(e.name!=='AbortError')throw e;interrupted=true;}finally{clearTimeout(timer);}
 check(interrupted,true,'client transport was interrupted');
 check((await request(u,`/api/questionnaire-sessions/${u.draft.answerForm.sessionId}/responses`,'PUT',{questionId:question.id,value:u.recoveredValue})).status,200,'retry save');
 const r=await request(u,'/api/submissions?subgameId=subgame-ka-fintech');check(r.body.submission.answerForm.responses[question.id],u.recoveredValue,'reconnected latest edit');
 });
 await phase('300 concurrent reconnect reads',users,async u=>{const r=await request(u,'/api/submissions?subgameId=subgame-ka-fintech');check(r.status,200,'reconnect read');check(r.body.submission.submissionId,u.draft.submissionId,'same draft');for(const question of u.draft.answerForm.questions){check(r.body.submission.answerForm.responses[question.id],question.key==='submission_mode'?'text':question.key==='case_truth_model'&&u.recoveredValue?u.recoveredValue:`[CLOUDFLARE QA] ${u.id}: ${question.key}`,'reconnected answer');}});
 // A real remote DB session expiry and fresh signed session, only for disposable QA identities.
 await query(`UPDATE session SET expiresAt=${Date.now()-60000}`);
 await phase('300 expired sessions rejected',users,async u=>check((await request(u,'/api/submissions?subgameId=subgame-ka-fintech')).status,401,'expired session'));
 await query('DELETE FROM session');
 for(const u of users){u.token=randomUUID();console.log(`::add-mask::${u.token}`);u.cookie=signed(u.token);}
 const reauthNow=Date.now();await query(`INSERT INTO session (id,token,userId,expiresAt,createdAt,updatedAt) VALUES ${users.map(u=>`(${q(randomUUID())},${q(u.token)},${q(u.id)},${reauthNow+3600000},${reauthNow},${reauthNow})`).join(',')}`);
 await phase('300 reauthenticated sessions recover saved draft',users,async u=>{const r=await request(u,'/api/submissions?subgameId=subgame-ka-fintech');check(r.status,200,'fresh session');check(r.body.submission.submissionId,u.draft.submissionId,'restored draft');check(Object.keys(r.body.submission.answerForm.responses).length,8,'restored answers');});
 await phase('300 concurrent questionnaire completions',users,async u=>check((await request(u,`/api/questionnaire-sessions/${u.draft.answerForm.sessionId}/complete`,'POST')).status,200,'complete'));
 await phase('300 concurrent private TXT uploads (1 KiB)',users,async u=>{const content=`[CLOUDFLARE QA] ${u.id}\n`.padEnd(1024,'.');u.content=content;const f=new FormData();f.set('kind','answer_attachment');f.set('file',new File([content],u.id+'.txt',{type:'text/plain'}));const r=await request(u,`/api/submissions/${u.draft.submissionId}/uploads`,'POST',f);check(r.status,201,'upload');u.uploadId=r.body.upload.id;uploads.push({private_r2_key:`research-uploads/${u.id}/${u.draft.submissionId}/${u.uploadId}.txt`});});
 await phase('300 concurrent finalizations and receipt reads',users,async u=>{check((await request(u,`/api/submissions/${u.draft.submissionId}/finalize`,'POST')).status,201,'finalize');const r=await request(u,'/api/submissions?subgameId=subgame-ka-fintech');check(r.status,200,'receipt');check(r.body.submission.status,'submitted','status');check(r.body.submission.submissionId,u.draft.submissionId,'receipt owner');});
 await phase('300 concurrent repeated finalize requests',users,async u=>check((await request(u,`/api/submissions/${u.draft.submissionId}/finalize`,'POST')).status,200,'idempotent retry'));
 const counts=(await query("SELECT (SELECT COUNT(*) FROM submissions WHERE status='submitted') AS submitted,(SELECT COUNT(*) FROM responses) AS responses,(SELECT COUNT(*) FROM uploads WHERE status='uploaded') AS uploaded,(SELECT COUNT(*) FROM activity_events WHERE event_type='submission_finalized') AS finalized_events,(SELECT COUNT(*) FROM submissions s JOIN questionnaire_sessions qs ON qs.id=s.questionnaire_session_id WHERE s.user_id!=qs.user_id) AS foreign_sessions,(SELECT COUNT(*) FROM responses r JOIN questionnaire_sessions qs ON qs.id=r.session_id WHERE r.value_json LIKE '%CLOUDFLARE QA%' AND r.value_json NOT LIKE '%'||qs.user_id||'%') AS foreign_answers"))[0];
 check(counts.submitted,users.length,'DB submissions');check(counts.responses,users.length*8,'DB responses');check(counts.uploaded,users.length,'DB uploads');check(counts.finalized_events,users.length,'DB finalization events');check(counts.foreign_sessions,0,'foreign sessions');check(counts.foreign_answers,0,'foreign answers');report.integrity={counts};
 uploads=await query('SELECT id,user_id,private_r2_key,sha256,bytes FROM uploads');
 await phase('R2 byte verification of 300 files (management concurrency 10)',users,async u=>withR2Slot(async()=>{const upload=uploads.find(x=>x.id===u.uploadId);const r=await fetch(`${api}/accounts/${account}/r2/buckets/${bucketName}/objects/${upload.private_r2_key}`,{headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`},signal:AbortSignal.timeout(45000)});check(r.status,200,'R2 read');check(await r.text(),u.content,'R2 bytes');check(upload.sha256,createHash('sha256').update(u.content).digest('hex'),'R2 checksum');}));
 report.integrity.filesByteVerified=users.length;report.status=report.partialFailure?'failed':'pass';if(report.partialFailure){report.failure='Measured phase failures; subsequent phases only cover surviving users';process.exitCode=1;}
}catch(e){report.status='failed';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{
 tailProcess?.kill();
 await persist();
 // Cleanup only resources created with this exact run name; no production identifiers.
 if(createdBucket){try{if(dbId){try{uploads=await query('SELECT private_r2_key FROM uploads');}catch(e){report.cleanup.push({resource:'qa object inventory',status:'failed',error:e.message});}}for(let off=0;off<uploads.length;off+=20)await Promise.all(uploads.slice(off,off+20).map(async u=>{const r=await fetch(`${api}/accounts/${account}/r2/buckets/${bucketName}/objects/${u.private_r2_key}`,{method:'DELETE',headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`}});if(!r.ok)throw new Error(`object cleanup ${r.status}`);}));await cf(`/accounts/${account}/r2/buckets/${bucketName}`,'DELETE');report.cleanup.push({resource:'qa bucket',status:'removed'});}catch(e){report.cleanup.push({resource:'qa bucket',status:'failed',error:e.message});}}
 if(createdWorker){try{await cf(`/accounts/${account}/workers/scripts/${name}`,'DELETE');report.cleanup.push({resource:'qa worker',status:'removed'});}catch(e){report.cleanup.push({resource:'qa worker',status:'failed',error:e.message});}}
 if(dbId){try{await cf(`/accounts/${account}/d1/database/${dbId}`,'DELETE');report.cleanup.push({resource:'qa database',status:'removed'});}catch(e){report.cleanup.push({resource:'qa database',status:'failed',error:e.message});}}
 report.finishedAt=new Date().toISOString();delete report.phase;await persist();
}
