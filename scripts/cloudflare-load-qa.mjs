/* global process, console, fetch, AbortSignal, Buffer, FormData, File, AbortController, setTimeout, setInterval, clearTimeout, clearInterval */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHmac,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {openAsBlob} from 'node:fs';
const account='c24fed68f8dc59cc339bd821d215bba8',api='https://api.cloudflare.com/client/v4';
const run=process.env.GITHUB_RUN_ID||'manual';
if(!/^\d+$/.test(run))throw new Error('Run only from GitHub Actions');
const scenario=process.env.QA_SCENARIO||'mixed';
if(!['mixed','all-ka','refresh-probe'].includes(scenario))throw new Error('Invalid scenario');
const refreshMode=process.env.QA_REFRESH_MODE||'stress';
if(!['stress','off','probe'].includes(refreshMode))throw new Error('Invalid refresh mode');
const name=`chao-ngo-qa-${run}-${scenario}`,dbName=name,bucketName=name;
const report={scope:'Remote Cloudflare Worker/D1/R2, candidate application at the recorded commit; 300 players with real PDFs and revision polling, real Better Auth session verification; synthetic QA identities, NOT 300 Google OAuth logins',source:process.env.GITHUB_SHA,candidateSource:process.env.QA_SOURCE,scenario,refreshMode,run,startedAt:new Date().toISOString(),phases:[],requests:[],resources:{worker:name,database:dbName,bucket:bucketName},cleanup:[]};
let dbId,origin,createdWorker=false,createdBucket=false,users=[],uploads=[],tailProcess,polling,stopPolling=false;
let peakDriverRss=0;const rssTimer=setInterval(()=>{peakDriverRss=Math.max(peakDriverRss,process.memoryUsage().rss);},1000);
report.cloudflareExceptions=[];report.cloudflareWarnings=[];report.tailOutcomes={};report.autosaveRetries=[];
const secret=randomBytes(48).toString('base64url');
console.log(`::add-mask::${secret}`);
await mkdir('qa-results',{recursive:true});
const persist=async()=>writeFile('qa-results/results.json',JSON.stringify(report,null,2));
async function cf(path,method='GET',body){
 const r=await fetch(api+path,{method,headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const j=await r.json();if(!r.ok||j.success===false)throw new Error(`Cloudflare ${method} ${path.split('/').slice(-2).join('/')} failed HTTP ${r.status} codes ${(j.errors||[]).map(x=>x.code).join(',')}`);return j.result;
}
const query=async sql=>{for(let retry=0;;retry++){try{return (await cf(`/accounts/${account}/d1/database/${dbId}/query`,'POST',{sql,params:[]}))[0]?.results||[];}catch(e){if(!/^SELECT/i.test(sql)||retry>=3||!e.message.includes('429'))throw e;await new Promise(r=>setTimeout(r,1000*2**retry));}}};
if(!process.env.QA_SOURCE || !/^[a-f0-9]{40}$/.test(process.env.QA_SOURCE))throw new Error('Pin the candidate commit');
const q=x=>`'${String(x).replaceAll("'","''")}'`;
function cli(args,input){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8',input,env:{...process.env,WRANGLER_LOG_PATH:`${process.env.RUNNER_TEMP}/chao-ngo-qa.log`},maxBuffer:20*1024*1024});if(r.status!==0){console.log((r.stderr||r.stdout).slice(-3000));throw new Error(`Wrangler ${args.slice(0,2).join(' ')} failed`,{cause:new Error((r.stderr||r.stdout).slice(-3000))});}console.log((r.stdout||'').slice(-2500));return r.stdout;}
function signed(token){return '__Secure-better-auth.session_token='+encodeURIComponent(token+'.'+createHmac('sha256',secret).update(token).digest('base64'));}
let inflight=0,peak=0,r2Slots=0;const r2Waiters=[];
async function withR2Slot(work){if(r2Slots>=10)await new Promise(resolve=>r2Waiters.push(resolve));else r2Slots++;try{return await work();}finally{const next=r2Waiters.shift();if(next)next();else r2Slots--;}}
async function request(user,path,method='GET',body,phaseName){
 const begin=performance.now();inflight++;peak=Math.max(peak,inflight);
 try {const r=await fetch(origin+path,{method,headers:{Origin:origin,...(user?{Cookie:user.cookie,...(path.endsWith('/uploads')&&user.uploadPermit?{'X-Upload-Permit':user.uploadPermit}:{})}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(path.endsWith('/uploads/admission')?150000:45000)});
 const raw=await r.text();const payload=(()=>{try{return JSON.parse(raw)}catch{return null}})();report.requests.push({phase:phaseName||report.phase,user:user?.id,path:path.replace(/[a-f0-9-]{36}/g,':id'),status:r.status,ms:Math.round(performance.now()-begin),code:payload?.code,serverTiming:r.headers.get("server-timing"),colo:r.headers.get("cf-ray")?.split("-").at(-1),...([404,500].includes(r.status)?{diagnostic:raw.slice(0,220),contentType:r.headers.get('content-type')}: {})});return {status:r.status,body:payload};}
 catch(e){report.requests.push({phase:phaseName||report.phase,user:user?.id,status:'network-error',ms:Math.round(performance.now()-begin),error:e.name,diagnostic:String(e.cause?.code??e.cause?.message??e.message).slice(0,200)});throw new Error(e.name,{cause:e});}
 finally{inflight--;}
}
function check(value,expected,label){if(value!==expected)throw new Error(`${label}: expected ${expected}, got ${value}`);}
function pct(xs,p){return [...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1]||0;}
async function phase(name,pool,work){report.phase=name;peak=0;const begin=performance.now(),durations=[],errors=[];await Promise.all(pool.map(async user=>{const t=performance.now();try{await work(user);}catch(e){errors.push({user:user.id,error:e.message});}durations.push(Math.round(performance.now()-t));}));const row={name,users:pool.length,successful:pool.length-errors.length,errors,elapsedMs:Math.round(performance.now()-begin),peakHttpInflight:peak,p50Ms:pct(durations,.5),p95Ms:pct(durations,.95),p99Ms:pct(durations,.99)};report.phases.push(row);console.log(JSON.stringify(row));await persist();if(errors.length){report.partialFailure=true;users=users.filter(u=>!errors.some(e=>e.user===u.id));if(!users.length)throw new Error(`${name} failed for all users`);}}
try{
 const subdomain=(await cf(`/accounts/${account}/workers/subdomain`)).subdomain;
 if(!subdomain)throw new Error('Existing workers.dev subdomain unavailable');origin=`https://${name}.${subdomain}.workers.dev`;report.origin=origin;
 const createdDatabase=await cf(`/accounts/${account}/d1/database`,'POST',{name:dbName,primary_location_hint:'apac'});dbId=createdDatabase.uuid;report.resources.databaseId=dbId;report.databaseLocation=createdDatabase.primary_location_hint;report.productionDatabaseMetadata=await cf(`/accounts/${account}/d1/database/420393d7-6abf-4a43-bc4d-4f5f94a5b7e9`);await persist();
 await cf(`/accounts/${account}/r2/buckets`,'POST',{name:bucketName});createdBucket=true;
 const base=JSON.parse((await readFile('wrangler.jsonc','utf8')).replace(/^\s*\/\/.*$/mg,''));
 const config={...base,name,routes:[],workers_dev:true,triggers:{crons:[]},vars:{BETTER_AUTH_URL:origin},d1_databases:[{binding:'DB',database_name:dbName,database_id:dbId,migrations_dir:'./migrations'}],r2_buckets:[{binding:'PUBLIC_ASSETS',bucket_name:bucketName},{binding:'PRIVATE_UPLOADS',bucket_name:bucketName}]};
 await writeFile('wrangler.qa.json',JSON.stringify(config));
 cli(['d1','migrations','apply','DB','--remote','--config','wrangler.qa.json']);
 await query("UPDATE app_metadata SET value='true' WHERE key='research_collection_enabled'");
 users=Array.from({length:300},(_,i)=>{const token=randomUUID();console.log(`::add-mask::${token}`);return {id:`remote-qa-${run}-${scenario}-${String(i).padStart(3,'0')}`,subgameId:(scenario!=='all-ka'?['subgame-ka-fintech','subgame-ka-wa-ve','subgame-node-zone-quantum','subgame-node-zone-space']:['subgame-ka-fintech','subgame-ka-wa-ve'])[i%(scenario!=='all-ka'?4:2)],token,cookie:signed(token),expected:{},files:[]};});
 const now=Date.now();
 await query(`INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES ${users.map(u=>`(${q(u.id)},'CLOUDFLARE SYNTHETIC QA',${q(u.id+'@example.test')},1,${now},${now})`).join(',')}`);
 await query(`INSERT INTO session (id,token,userId,expiresAt,createdAt,updatedAt) VALUES ${users.map(u=>`(${q(randomUUID())},${q(u.token)},${q(u.id)},${now+3600000},${now},${now})`).join(',')}`);
 await query(`INSERT INTO consent_records (id,user_id,consent_version,data_notice_version,research_participation,ai_chat_upload_consent) VALUES ${users.map(u=>`(${q(randomUUID())},${q(u.id)},'2026-09-21.1','2026-09-21.1',1,0)`).join(',')}`);
 await query(`INSERT INTO user_profiles (user_id) VALUES ${users.map(u=>`(${q(u.id)})`).join(',')}`);
 const build=spawnSync('npm',['run','build'],{stdio:'inherit',env:process.env});if(build.status!==0)throw new Error('Build failed');
 const generated=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
 Object.assign(generated,{name,routes:[],workers_dev:true,triggers:{crons:[]},vars:{BETTER_AUTH_URL:origin},d1_databases:[{binding:'DB',database_name:dbName,database_id:dbId}],r2_buckets:config.r2_buckets});
 await writeFile('dist/server/wrangler.qa.json',JSON.stringify(generated));
 // Secret upload creates only the new QA worker; never modify production secrets.
 cli(['secret','put','BETTER_AUTH_SECRET','--config','dist/server/wrangler.qa.json'],secret+'\n');createdWorker=true;
 await new Promise(r=>setTimeout(r,10000));
 for(let attempt=0;;attempt++){try{cli(['deploy','--config','dist/server/wrangler.qa.json']);break;}catch(error){if(attempt>=2||!error.cause?.message.includes("Cannot read properties of null (reading 'tag')"))throw error;report.setupDeployRetries=(report.setupDeployRetries||0)+1;await new Promise(r=>setTimeout(r,10000));}}
 report.qaSubdomain=await cf(`/accounts/${account}/workers/scripts/${name}/subdomain`,'POST',{enabled:true,previews_enabled:false});
 tailProcess=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','tail','--format','json','--config','dist/server/wrangler.qa.json'],{env:process.env,stdio:['ignore','pipe','ignore']});
 let tailBuffer='',tailJson='';report.tailEvents=0;
 const captureTail=event=>{report.tailEvents++;report.tailOutcomes[event.outcome]=(report.tailOutcomes[event.outcome]||0)+1;for(const ex of event.exceptions||[]){if(report.cloudflareExceptions.length<30)report.cloudflareExceptions.push({name:ex.name,message:String(ex.message).slice(0,1000)});}for(const log of event.logs||[]){const msg=(log.message||[]).join(' ');if(/D1(?:_| transient| queue| connection)|SQLITE|overload|queue|exceeded|Error/i.test(msg)&&report.cloudflareWarnings.length<30)report.cloudflareWarnings.push({name:log.level,message:msg.slice(0,1000)});}};
 tailProcess.stdout.on('data',chunk=>{tailBuffer+=chunk.toString();let pos;while((pos=tailBuffer.indexOf('\n'))>=0){const line=tailBuffer.slice(0,pos);tailBuffer=tailBuffer.slice(pos+1);if(line==='{'||tailJson){tailJson+=line+'\n';if(line==='}'){try{captureTail(JSON.parse(tailJson));}catch{/* Ignore incomplete tail frames. */}tailJson='';}}else{try{captureTail(JSON.parse(line));}catch{/* Ignore incomplete tail frames. */}}}});
 // Allow the new worker to become available; bounded readiness, not counted as load.
 for(let i=0;i<60;i++){const r=await request(null,'/api/submissions');if(r.status===401)break;if(i===59)throw new Error('QA endpoint not ready');await new Promise(r=>setTimeout(r,2000));}
 // Record a 30-second propagation/warm-up window before measured traffic. No measured failure is retried.
 report.phase='deployment propagation warmup';
 for(let round=0;round<6;round++){await Promise.all(Array.from({length:5},()=>request(null,'/api/submissions')));await new Promise(r=>setTimeout(r,5000));}
 delete report.phase;
 const unauth=await request(null,'/api/submissions');check(unauth.status,401,'Unauthenticated guard');check((await request(null,'/api/submissions/00000000-0000-4000-8000-000000000000/finalize','POST')).status,401,'Coordinator auth guard');
 const sanity=await request(users[0],'/api/auth/get-session');check(sanity.status,200,'Signed session sanity status');check(sanity.body?.user?.id,users[0].id,'Signed session sanity identity');
 report.phase='sequential profile latency diagnostic';for(let i=0;i<3;i++)check((await request(users[i],'/api/player-research-profile')).status,409,'empty profile sanity');delete report.phase;
 const profile={age:25,educationLevel:'bachelor',gender:'prefer_not_to_say',institution:'SYNTHETIC QA NOT RESEARCH',scienceInterest:3,fieldInterests:{quantum:3,space:3,psychology:3,fintech:3,biotech:3},personalSkills:['QA testing']};
 await phase('300 concurrent profile writes and owner readback',users,async u=>{
  u.age=[0,12,17,25][Number(u.id.slice(-3))%4];const data={...profile,age:u.age,institution:u.id};check((await request(u,'/api/player-research-profile','PATCH',data)).status,200,'profile save');
  const r=await request(u,'/api/player-research-profile');check(r.status,200,'profile read');check(r.body.profile.institution,u.id,'profile owner');check(r.body.profile.age,u.age,'age without adult minimum');
  check((await request(u,'/api/player-progress')).status,200,'progress');
 });
 await phase('300 concurrent start/resume draft',users,async u=>{const r=await request(u,'/api/submissions','POST',{subgameId:u.subgameId});check(r.status,201,'start');u.draft=r.body.submission;});
 report.distribution=Object.fromEntries([...new Set(users.map(u=>u.subgameId))].map(id=>[id,users.filter(u=>u.subgameId===id).length]));
 report.phase='ownership guard';check((await request(users[1],`/api/submissions/${users[0].draft.submissionId}/finalize`,'POST')).status,404,'foreign owner');check((await request(users[1],`/api/submissions/${users[0].draft.submissionId}/uploads/admission`,'POST',{bytes:2097152})).status,404,'foreign upload preflight');check((await request(users[0],`/api/submissions/${users[0].draft.submissionId}/uploads/admission`,'POST',{bytes:2097152})).status,403,'preflight requires acknowledgement');delete report.phase;
 report.polling={intervalMs:6000,requests:0,errors:0};
 polling=Promise.all(users.map(async u=>{while(!stopPolling){
  try{const r=await request(u,'/api/questionnaires/revisions','GET',undefined,'background revision polling');report.polling.requests++;if(r.status!==200)report.polling.errors++;}
  catch{report.polling.errors++;}await new Promise(r=>setTimeout(r,6000));
 }}));
 const answerValue=(u,question)=>{
  if(question.type==='scale')return Math.min(question.options?.max??5,Math.max(question.options?.min??1,4));
  if(question.type==='single')return question.options.find(o=>o.value==='text')?.value||question.options[0].value;
  if(question.type==='multi')return [question.options[0].value];
  if(question.options?.format==='https-url')return `https://chatgpt.com/share/qa-${u.id}`;
  return `[CLOUDFLARE QA NOT RESEARCH] ${u.id}: ${question.key}`;
 };
 async function save(u,form,question,value){
  for(let attempt=0;;attempt++){
   const r=await request(u,`/api/questionnaire-sessions/${form.sessionId}/responses`,'PUT',{questionId:question.id,value});
   if(r.status===200)return;
   if(attempt>=3||r.status!==503||r.body?.code!=='DATABASE_BUSY')check(r.status,200,`save ${question.key} (${r.body?.code})`);
   report.autosaveRetries.push({user:u.id,question:question.key,attempt:attempt+1,status:r.status,code:r.body?.code});
   await new Promise(r=>setTimeout(r,2000*2**attempt));
  }
 }
 const key=(form,question)=>`${form.key}:${question.key}`;
 async function readDraft(u){const r=await request(u,`/api/submissions?subgameId=${u.subgameId}`);check(r.status,200,'draft read');check(r.body.submission.submissionId,u.draft.submissionId,'submission owner');return r.body.submission;}
 function verifyAnswers(u,draft){for(const form of [draft.answerForm,draft.posttestForm].filter(Boolean))for(const question of form.questions){if(question.type==='file')continue;check(JSON.stringify(form.responses[question.id]),JSON.stringify(u.expected[key(form,question)]),`stored ${question.key}`);}}
 await phase('300 players autosave answer and postgame forms with polling',users,async u=>{
  for(const form of [u.draft.answerForm,u.draft.posttestForm].filter(Boolean))for(const question of form.questions){if(question.type==='file')continue;const value=answerValue(u,question);await save(u,form,question,value);u.expected[key(form,question)]=value;}
  verifyAnswers(u,await readDraft(u));
 });
 await phase('10 interrupted remote writes and latest-edit recovery',users.slice(0,10),async u=>{
  const form=u.draft.answerForm,question=form.questions.find(q=>q.type==='long');const value=`[CLOUDFLARE QA NOT RESEARCH] ${u.id}: reconnect latest edit`;
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),50);let mode;
  // If the server replies faster than the abort timer, discard its acknowledgement.
  // Both cases test recovery when the caller cannot know whether a write committed.
  try{const r=await fetch(origin+`/api/questionnaire-sessions/${form.sessionId}/responses`,{method:'PUT',headers:{Origin:origin,Cookie:u.cookie,'Content-Type':'application/json'},body:JSON.stringify({questionId:question.id,value}),signal:ctrl.signal});check(r.status,200,'fast interrupted write');await r.body?.cancel();mode='discarded acknowledgement';}catch(e){if(e.name!=='AbortError')throw e;mode='aborted request';}finally{clearTimeout(timer);}
  (report.interruptions??=[]).push({user:u.id,mode});await save(u,form,question,value);u.expected[key(form,question)]=value;verifyAnswers(u,await readDraft(u));
 });
 if(refreshMode!=='off'){
 // Publish prompt-only updates on the isolated database, without editing production content.
 report.phase='isolated prompt publication';
 const instruments=await query("SELECT id,questionnaire_key FROM questionnaires WHERE published=1 AND questionnaire_key LIKE 'submission:%'");
 for(const old of instruments){const next=`qa-live-${old.id}`;await query(`
 INSERT INTO questionnaires(id,questionnaire_key,version,title,published) SELECT ${q(next)},questionnaire_key,'qa-live-20261010',title,0 FROM questionnaires WHERE id=${q(old.id)};
 INSERT INTO questions(id,questionnaire_id,question_key,prompt_th,type,required,options_json,scoring_json,research_construct,sort_order)
 SELECT ${q('qa-live-')}||id,${q(next)},question_key,prompt_th||' [QA updated]',type,required,options_json,scoring_json,research_construct,sort_order FROM questions WHERE questionnaire_id=${q(old.id)};
 UPDATE questionnaires SET published=0 WHERE id=${q(old.id)};
 UPDATE questionnaires SET published=1 WHERE id=${q(next)};
 INSERT INTO questionnaire_publication_history(questionnaire_id) VALUES (${q(next)});`);}
 if(refreshMode==='probe'){stopPolling=true;await polling;report.diagnosticChain=await query(`WITH RECURSIVE chain(id, depth) AS (SELECT id, 0 FROM questionnaire_sessions WHERE id=${q(users[0].draft.answerForm.sessionId)} AND user_id=${q(users[0].id)} UNION ALL SELECT u.current_session_id, chain.depth+1 FROM questionnaire_session_updates u JOIN chain ON u.previous_session_id=chain.id WHERE chain.depth<50) SELECT id FROM chain ORDER BY depth DESC LIMIT 1`);}
 await phase('300 concurrent live question refreshes preserve saved answers',refreshMode==='probe'?users.slice(0,1):users,async u=>{
  const old=u.draft.answerForm.sessionId;
  const r=await request(u,`/api/questionnaire-sessions/${old}/refresh`,'POST');check(r.status,200,'refresh');check(r.body.updated,true,'updated instrument');
  u.draft=await readDraft(u);check(u.draft.answerForm.version,'qa-live-20261010','live version');check(u.draft.answerForm.questions.every(q=>q.promptTh.endsWith('[QA updated]')),true,'changed prompts');verifyAnswers(u,u.draft);
 });
 if(refreshMode==='probe'){await new Promise(r=>setTimeout(r,3000));throw new Error('Live refresh diagnostic complete; see measured phase and Worker exceptions');}
 }
 await phase('300 concurrent AI preparation and PDF acknowledgement writes',users,async u=>{
  u.aiLinks=[`https://chatgpt.com/share/qa-${u.id}`];
  const r=await request(u,`/api/submissions/${u.draft.submissionId}/preparation`,'PATCH',{aiCompanionUsed:true,additionalAiLinks:u.aiLinks});check(r.status,200,'AI preparation');
  check((await request(u,`/api/submissions/${u.draft.submissionId}/acknowledgement`,'POST',{acknowledged:true,consentVersion:'2026-09-21.1-ai-pdf'})).status,201,'synthetic PDF acknowledgement');
 });
 await phase('300 concurrent questionnaire completions',users,async u=>{for(const form of [u.draft.answerForm,u.draft.posttestForm].filter(Boolean))check((await request(u,`/api/questionnaire-sessions/${form.sessionId}/complete`,'POST')).status,200,'complete');});
 // Valid, uncompressed PDF documents with per-owner text, sized exactly as reported.
 function pdfBytes(userId,targetBytes){
  let buffer=Buffer.from('%PDF-1.7\n');const offsets=[0];
  const stream=`BT /F1 12 Tf 50 750 Td (SYNTHETIC QA NOT RESEARCH ${userId}) Tj ET\n`;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  objects.forEach((obj,i)=>{offsets.push(buffer.length);buffer=Buffer.concat([buffer,Buffer.from(`${i+1} 0 obj\n${obj}\nendobj\n`)]);});
  const xref=buffer.length;const end=Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF\n`);
  // Add whitespace before xref. Adjust startxref to the actual byte offset after padding.
  const suffix=Buffer.from(end.toString().replace(`\n${xref}\n%%EOF`, `\n${targetBytes-end.length}\n%%EOF`));
  let pad=targetBytes-buffer.length-suffix.length;
  const actualSuffix=Buffer.from(end.toString().replace(`\n${xref}\n%%EOF`,`\n${buffer.length+pad}\n%%EOF`));
  pad=targetBytes-buffer.length-actualSuffix.length;
  return Buffer.concat([buffer,Buffer.alloc(pad,32),actualSuffix]);
 }
 await mkdir('qa-results/pdfs',{recursive:true});
 for(let i=0;i<users.length;i++){const u=users[i];for(const kind of ['ai_chat_pdf']){
  if(kind==='answer_attachment'&&!u.draft.requirements.allowedAnswerAttachmentExtensions.includes('pdf'))continue;
  const bytes=pdfBytes(u.id,(i<12?20:2)*1024*1024);const path=`qa-results/pdfs/${u.id}-${kind}.pdf`;
  await writeFile(path,bytes);u.files.push({kind,path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }}
 report.fileSizes=Object.fromEntries(['ai_chat_pdf'].map(kind=>[kind,users.flatMap(u=>u.files).filter(f=>f.kind===kind).reduce((counts,f)=>({...counts,[f.bytes]:(counts[f.bytes]||0)+1}),{})]));
 for(const kind of ['ai_chat_pdf'])await phase(`${kind} simultaneous PDF uploads with revision polling`,users.filter(u=>u.files.some(f=>f.kind===kind)),async u=>{
  const file=u.files.find(f=>f.kind===kind);
  const permission=await request(u,`/api/submissions/${u.draft.submissionId}/uploads/admission`,'POST',{bytes:file.bytes});check(permission.status,200,'upload admission');u.uploadPermit=permission.body.permit;
  if(!u.uploadPermit)throw new Error('Missing server upload permit');
  const form=new FormData();form.set('kind',kind);form.set('file',new File([await openAsBlob(file.path,{type:'application/pdf'})],`${u.id}-${kind}.pdf`,{type:'application/pdf'}));
  if(u===users[0]){const guard=new FormData();guard.set('file',new File([Buffer.from('%PDF-1.7\n%%EOF\n')],'guard.pdf',{type:'application/pdf'}));
   check((await request(u,`/api/submissions/${users[1].draft.submissionId}/uploads`,'POST',guard)).status,409,'permit cannot change case');
   check((await request({...u,uploadPermit:undefined},`/api/submissions/${u.draft.submissionId}/uploads`,'POST',guard)).status,428,'large body requires preflight');
  }
  const r=await request(u,`/api/submissions/${u.draft.submissionId}/uploads`,'POST',form);check(r.status,201,`upload ${kind} (${r.body?.code})`);file.uploadId=r.body.upload.id;
  if(u===users[0]){const replay=new FormData();replay.set('file',new File([Buffer.from('%PDF-1.7\n%%EOF\n')],'guard.pdf',{type:'application/pdf'}));check((await request(u,`/api/submissions/${u.draft.submissionId}/uploads`,'POST',replay)).status,409,'permit is single use');}
 });
 await phase('300 concurrent finalizations and receipt ownership checks',users,async u=>{
  check((await request(u,`/api/submissions/${u.draft.submissionId}/finalize`,'POST')).status,201,'finalize');const draft=await readDraft(u);check(draft.status,'submitted','receipt status');verifyAnswers(u,draft);check(draft.preparation.aiCompanionUsed,true,'receipt confirmation');check(JSON.stringify(draft.preparation.additionalAiLinks),JSON.stringify(u.aiLinks),'receipt private links');
  for(const f of u.files){const received=f.kind==='ai_chat_pdf'?draft.uploads.aiChatPdf:draft.uploads.answerAttachment;check(received.id,f.uploadId,'receipt file owner');check(received.bytes,f.bytes,'receipt file size');}
 });
 await phase('300 concurrent repeated finalize requests without duplicates',users,async u=>check((await request(u,`/api/submissions/${u.draft.submissionId}/finalize`,'POST')).status,200,'idempotent finalize'));
 await query(`UPDATE session SET expiresAt=${Date.now()-60000}`);
 await phase('300 expired sessions rejected',users,async u=>{check((await request(u,`/api/submissions?subgameId=${u.subgameId}`)).status,401,'expired read');check((await request(u,`/api/submissions/${u.draft.submissionId}/finalize`,'POST')).status,401,'expired finalize');});
 await query('DELETE FROM session');
 for(const u of users){u.token=randomUUID();console.log(`::add-mask::${u.token}`);u.cookie=signed(u.token);}
 const reauthNow=Date.now();await query(`INSERT INTO session(id,token,userId,expiresAt,createdAt,updatedAt) VALUES ${users.map(u=>`(${q(randomUUID())},${q(u.token)},${q(u.id)},${reauthNow+3600000},${reauthNow},${reauthNow})`).join(',')}`);
 await phase('300 reauthenticated sessions restore answers profiles and AI links',users,async u=>{
  const draft=await readDraft(u);verifyAnswers(u,draft);check(draft.preparation.aiCompanionUsed,true,'AI confirmation');check(JSON.stringify(draft.preparation.additionalAiLinks),JSON.stringify(u.aiLinks),'AI links');
  const r=await request(u,'/api/player-research-profile');check(r.status,200,'restored profile');check(r.body.profile.institution,u.id,'restored profile owner');check(r.body.profile.age,u.age,'restored age');
 });
 stopPolling=true;await polling;
 const counts=(await query(`SELECT
 (SELECT COUNT(*) FROM submissions WHERE status='submitted') submitted,
 (SELECT COUNT(*) FROM responses) responses,
 (SELECT COUNT(*) FROM responses r WHERE r.session_id IN (SELECT questionnaire_session_id FROM submissions UNION SELECT posttest_session_id FROM submissions)) active_responses,
 (SELECT COUNT(*) FROM user_profiles) profiles,
 (SELECT COUNT(*) FROM submissions WHERE ai_companion_confirmed_at IS NOT NULL AND json_array_length(additional_ai_links_json)=1) ai_preparations,
 (SELECT COUNT(*) FROM uploads WHERE status='uploaded') uploaded,
 (SELECT COUNT(*) FROM activity_events WHERE event_type='submission_finalized') finalized_events,
 (SELECT COUNT(*) FROM submissions s JOIN questionnaire_sessions qs ON qs.id=s.questionnaire_session_id WHERE s.user_id!=qs.user_id) foreign_sessions,
 (SELECT COUNT(*) FROM responses r JOIN questionnaire_sessions qs ON qs.id=r.session_id WHERE r.value_json LIKE '%CLOUDFLARE QA%' AND r.value_json NOT LIKE '%'||qs.user_id||'%') foreign_answers`))[0];
 report.integrity={counts};check(counts.foreign_sessions,0,'foreign sessions');check(counts.foreign_answers,0,'foreign answers');
 if(!report.partialFailure){check(counts.submitted,300,'submitted');check(counts.profiles,300,'profiles');check(counts.ai_preparations,300,'AI preparations');check(counts.active_responses,users.reduce((n,u)=>n+Object.keys(u.expected).length,0),'active answers');check(counts.uploaded,users.reduce((n,u)=>n+u.files.length,0),'uploads');check(counts.finalized_events,300,'events');}
 uploads=await query('SELECT id,user_id,private_r2_key,original_name,sha256,bytes FROM uploads');
 let filesByteVerified=0;
 await phase('R2 SHA256 verification of every owner file (management concurrency 10)',users,async u=>{
  for(const file of u.files)if(file.uploadId)await withR2Slot(async()=>{
   const row=uploads.find(x=>x.id===file.uploadId);check(row.user_id,u.id,'R2 owner metadata');check(row.bytes,file.bytes,'DB file length');check(row.sha256,file.sha256,'DB checksum');
   const r=await fetch(`${api}/accounts/${account}/r2/buckets/${bucketName}/objects/${row.private_r2_key}`,{headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`},signal:AbortSignal.timeout(45000)});check(r.status,200,'R2 read');
   const hash=createHash('sha256');let bytes=0;for await(const chunk of r.body){hash.update(chunk);bytes+=chunk.length;}
   check(bytes,file.bytes,'R2 byte length');check(hash.digest('hex'),file.sha256,'R2 checksum');filesByteVerified++;
  });
 });
 if(report.polling.errors)report.partialFailure=true;
 report.integrity.filesByteVerified=filesByteVerified;report.status=report.partialFailure?'failed':'pass';if(report.partialFailure){report.failure='Measured phase failures; subsequent phases only cover surviving users';process.exitCode=1;}
}catch(e){report.status='failed';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{
 stopPolling=true;if(polling)await polling;
 clearInterval(rssTimer);report.peakDriverRssBytes=peakDriverRss;
 if(tailProcess)await new Promise(r=>setTimeout(r,2000));
 tailProcess?.kill();
 await persist();
 // Cleanup only resources created with this exact run name; no production identifiers.
 if(createdBucket){try{if(dbId){try{uploads=await query('SELECT private_r2_key FROM uploads');}catch(e){report.cleanup.push({resource:'qa object inventory',status:'failed',error:e.message});}}for(let off=0;off<uploads.length;off+=20)await Promise.all(uploads.slice(off,off+20).map(async u=>{const r=await fetch(`${api}/accounts/${account}/r2/buckets/${bucketName}/objects/${u.private_r2_key}`,{method:'DELETE',headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`}});if(!r.ok)throw new Error(`object cleanup ${r.status}`);}));await cf(`/accounts/${account}/r2/buckets/${bucketName}`,'DELETE');report.cleanup.push({resource:'qa bucket',status:'removed'});}catch(e){report.cleanup.push({resource:'qa bucket',status:'failed',error:e.message});}}
 if(createdWorker){try{await cf(`/accounts/${account}/workers/scripts/${name}?force=true`,'DELETE');report.cleanup.push({resource:'qa worker',status:'removed'});}catch(e){report.cleanup.push({resource:'qa worker',status:'failed',error:e.message});}}
 if(dbId){try{await cf(`/accounts/${account}/d1/database/${dbId}`,'DELETE');report.cleanup.push({resource:'qa database',status:'removed'});}catch(e){report.cleanup.push({resource:'qa database',status:'failed',error:e.message});}}
 report.finishedAt=new Date().toISOString();delete report.phase;await persist();
}
