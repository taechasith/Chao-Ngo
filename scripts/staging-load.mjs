/* global process, console, fetch, AbortSignal, Buffer, FormData, File, setTimeout */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, randomBytes, createHmac, createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

const account = "c24fed68f8dc59cc339bd821d215bba8";
const run = process.env.GITHUB_RUN_ID;
const attempt = process.env.GITHUB_RUN_ATTEMPT;
const cohort = Number(process.argv[2]);
const cap = Number(process.argv[3] ?? 20);
const token = process.env.CLOUDFLARE_API_TOKEN;
if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REPOSITORY !== "taechasith/Chao-Ngo"
  || process.env.GITHUB_REF !== "refs/heads/codex/staging-load-20261112"
  || !/^\d{1,20}$/.test(run ?? "") || !/^\d{1,4}$/.test(attempt ?? "") || ![100,300,1000].includes(cohort) || ![6,20].includes(cap) || !token) {
  throw new Error("Use only the dedicated Chao Ngo staging workflow and bounded cohort sizes");
}
const name = `chao-ngo-stage-${run}-${attempt}-${cohort}${cap === 20 ? "" : "-c6"}`;
const privateBucket = name + "-private";
const publicBucket = name + "-public";
const api = `https://api.cloudflare.com/client/v4/accounts/${account}`;
const testDir = `qa-results/${cohort}${cap === 20 ? "" : "-cap6"}`;
const report = { cohort, cap, commit:process.env.GITHUB_SHA, status:"starting", startedAt:new Date().toISOString(),
  scope:"Isolated Cloudflare Worker/D1/R2; QA fixtures and real Better Auth session verification. No Google OAuth or production traffic.",
  resources:{worker:name, database:name, privateBucket, publicBucket}, phases:[], cleanup:[], failedFinalize:[], diagnostics:[] };
let databaseId;
let origin;
let workerCreated = false;
let tail;
function startTail() {
  tail = spawn(process.execPath,["node_modules/wrangler/bin/wrangler.js","tail",name,"--format","json"],{
    env:{...process.env,WRANGLER_SEND_METRICS:"false",WRANGLER_LOG_PATH:process.env.RUNNER_TEMP+"/staging-tail.log"},
    stdio:["ignore","pipe","pipe"],
  });
  let buffer="";
  tail.stdout.setEncoding("utf8");
  tail.stdout.on("data", chunk => {
    buffer+=chunk;
    if (buffer.length>2_000_000) buffer="";
    // Wrangler pretty-prints each JSON event with the closing brace at the start of a line.
    for (let end=buffer.indexOf("\n}\n");end>=0;end=buffer.indexOf("\n}\n")) {
      const block=buffer.slice(0,end+2);
      buffer=buffer.slice(end+3);
      try {
        const entry=JSON.parse(block.slice(block.indexOf("{")));
        for (const log of entry.logs??[]) {
          for(const part of log.message??[]) {
            if(typeof part!=="string" || !part.startsWith('{"event":"submission_finalize"'))continue;
            const row=JSON.parse(part);
            if(/^[a-f0-9-]{36}$/.test(row.trace??"") && /^[a-z0-9_:]+$/.test(row.stage??"") && report.diagnostics.length<6000)
              report.diagnostics.push({trace:row.trace,stage:row.stage,elapsedMs:row.elapsedMs,category:row.category,frames:row.frames});
          }
        }
      } catch { /* Unrecognized event format; no raw logs stored. */ }
    }
  });
  tail.stderr.resume();
  tail.on("error",()=>{report.tailStatus="unable_to_start";});
  tail.on("exit", (code, signal)=>{report.tailStatus=signal?"stopped":`exit_${code}`;});
  report.tailStatus="started";
}
const bucketsCreated = [];
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
await mkdir(testDir,{recursive:true});
const persist = () => writeFile(testDir+"/results.json",JSON.stringify(report,null,2)+"\n");
await persist();
async function cf(path,method="GET",body) {
  for (let retry=0;;retry++) {
    const response = await fetch(api+path,{
      method, redirect:"error", signal:AbortSignal.timeout(45000),
      headers:{Authorization:"Bearer "+token,...(body===undefined?{}:{"Content-Type":"application/json"})},
      body:body===undefined?undefined:JSON.stringify(body),
    });
    if (response.status===429 && ["GET","DELETE"].includes(method) && retry<3) {
      await response.body?.cancel(); await wait(2500*2**retry); continue;
    }
    const payload=await response.text();
    const data=payload?JSON.parse(payload):{};
    if (!response.ok || data.success===false) throw new Error(`Cloudflare ${method} ${path.split("?")[0]} HTTP ${response.status} codes ${(data.errors??[]).map(e=>e.code).join(",")}`);
    return data.result;
  }
}
async function sql(sql,params=[]) {
  if (!databaseId || databaseId===productionDbId) throw new Error("No verified staging database");
  const result=await cf(`/d1/database/${databaseId}/query`,"POST",{sql,params});
  if(!result?.[0] || result.some(r=>r.success===false)) throw new Error("Staging query failed");
  return result[0].results??[];
}
function cli(args,input) {
  const result=spawnSync(process.execPath,["node_modules/wrangler/bin/wrangler.js",...args],{
    encoding:"utf8",input,maxBuffer:20*1024*1024,timeout:300000,
    env:{...process.env,WRANGLER_SEND_METRICS:"false",WRANGLER_LOG_PATH:process.env.RUNNER_TEMP+"/staging-wrangler.log"},
  });
  if(result.status!==0) {
    const detail=(result.stderr||result.stdout||"").slice(-3000);
    console.error(detail);
    throw new Error(`Wrangler ${args.slice(0,2).join(" ")} failed`,{cause:new Error(detail)});
  }
  console.log((result.stdout||"").slice(-2000));
}
function check(actual,expected,label) {
  if(actual!==expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
let inFlight=0,peak=0;
async function request(actor,path,method="GET",body,expected=200,timeoutMs=90_000) {
  if (!origin || !new URL(origin).hostname.startsWith(name+".") || !path.startsWith("/api/")) throw new Error("Non-staging destination rejected");
  inFlight++;peak=Math.max(peak,inFlight);
  try {
    const response=await fetch(origin+path,{
      method,redirect:"error",signal:AbortSignal.timeout(timeoutMs),
      headers:{Origin:origin,...(actor?{Cookie:actor.cookie}:{}),...(body!==undefined&&!(body instanceof FormData)?{"Content-Type":"application/json"}:{})},
      body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),
    });
    const data=await response.json().catch(()=>null);
    if(response.status!==expected) {
      if(method==="POST" && path.endsWith("/finalize")) {
        const trace=response.headers.get("x-finalize-trace");
        report.failedFinalize.push({actor:actor.index+1,http:response.status,code:data?.code,trace:/^[a-f0-9-]{36}$/.test(trace??"")?trace:undefined});
      }
      throw new Error(`HTTP ${response.status} ${data?.code??""}`.trim());
    }
    return data;
  } finally {inFlight--;}
}
const percentile=(sorted,p)=>Math.round(sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??0);
async function phase(name,actors,limit,operation,allowAllFailed=false) {
  const started=performance.now(),durations=[],errors={},passed=[];
  const width=Math.min(actors.length,limit);
  let index=0;peak=0;
  await Promise.all(Array.from({length:width},async()=>{
    for (;;) {
      const actor=actors[index++];if(!actor)return;
      const start=performance.now();
      try {await operation(actor);passed.push(actor);}
      catch(e) {
        const code=e?.name==="TimeoutError"?"HTTP timeout":String(e?.message??"unknown").slice(0,140);
        errors[code]=(errors[code]??0)+1;
      }
      finally{durations.push(performance.now()-start);}
    }
  }));
  durations.sort((a,b)=>a-b);
  const result={name,attempted:actors.length,passed:passed.length,failed:actors.length-passed.length,
    peakHttp:peak,p50Ms:percentile(durations,.5),p95Ms:percentile(durations,.95),p99Ms:percentile(durations,.99),
    over10s:durations.filter(ms=>ms>10000).length,elapsedMs:Math.round(performance.now()-started),errors};
  report.phases.push(result);console.log("PHASE",JSON.stringify(result));await persist();
  if(!passed.length && actors.length && !allowAllFailed)throw new Error(`${name} failed for all ${actors.length} users`);
  return passed.sort((a,b)=>a.index-b.index);
}
const caseIds=["subgame-node-zone-quantum","subgame-node-zone-space","subgame-ka-fintech","subgame-ka-wa-ve"];
const versions=await readFile("lib/server/research-consent-copy.ts","utf8");
const version=(id)=>versions.match(new RegExp(`export const ${id} = "([^"]+)"`))?.[1];
const consentVersion=version("consentVersion"), dataNoticeVersion=version("dataNoticeVersion"), pdfVersion=version("aiChatUploadConsentVersion");
if(!consentVersion || !dataNoticeVersion || !pdfVersion)throw new Error("Missing current consent versions");
const secret=randomBytes(48).toString("base64url");
console.log("::add-mask::"+secret);
const sign = value => "__Secure-better-auth.session_token="+encodeURIComponent(value+"."+createHmac("sha256",secret).update(value).digest("base64"));
const actors=Array.from({length:cohort},(_,index)=>{
  const id=`stage-${run}-${cohort}-${index+1}`;
  const sessionToken=randomUUID();
  console.log("::add-mask::"+sessionToken);
  return {id,index,sessionToken,cookie:sign(sessionToken),subgameId:caseIds[index%caseIds.length]};
});
function fixtureValue(question,actor) {
  if(question.type==="scale")return Math.min(question.options?.max??5,Math.max(question.options?.min??1,3));
  if(question.type==="single")return question.options[0].value;
  if(question.type==="multi")return [question.options[0].value];
  if(question.options?.format==="https-url")return "https://example.test/"+actor.id;
  return "Synthetic QA answer "+actor.id;
}
async function seedResponses(pool,formsFor) {
  const rows=pool.flatMap(actor=>formsFor(actor).flatMap(form=>form.questions.filter(q=>q.required).map(q=>({
    id:randomUUID(),session:form.sessionId,question:q.id,value:JSON.stringify(fixtureValue(q,actor)),
  }))));
  for(let i=0;i<rows.length;i+=120)await sql(`INSERT INTO responses(id,session_id,question_id,value_json)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.session'),json_extract(value,'$.question'),json_extract(value,'$.value') FROM json_each(?)`,
    [JSON.stringify(rows.slice(i,i+120))]);
}
function makePdf(label,bytes) {
  const stream="BT /F1 12 Tf 30 740 Td (Synthetic QA "+label+") Tj ET\n%"+"x".repeat(bytes-600)+"\n";
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length "+stream.length+" >>\nstream\n"+stream+"endstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf="%PDF-1.7\n";const offsets=[];
  objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=(index+1)+" 0 obj\n"+object+"\nendobj\n";});
  const xref=pdf.length;
  pdf+="xref\n0 6\n0000000000 65535 f \n"+offsets.map(offset=>String(offset).padStart(10,"0")+" 00000 n \n").join("");
  pdf+="trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
  return Buffer.from(pdf);
}
const original = JSON.parse((await readFile("wrangler.jsonc","utf8")).replace(/^\s*\/\/.*$/mg,""));
const productionDbId=original.d1_databases[0].database_id;
function validateConfig(config) {
  check(config.name,name,"Worker name");
  check(config.account_id,account,"Cloudflare account");
  check(config.routes?.length,0,"custom routes");
  check(config.triggers?.crons?.length,0,"cron triggers");
  check(config.d1_databases?.length,1,"D1 count");
  check(config.d1_databases[0].database_id,databaseId,"staging D1");
  check(config.d1_databases[0].database_name,name,"staging D1 name");
  check(config.r2_buckets?.length,2,"R2 count");
  check(config.r2_buckets.find(x=>x.binding==="PUBLIC_ASSETS")?.bucket_name,publicBucket,"staging public assets");
  check(config.r2_buckets.find(x=>x.binding==="PRIVATE_UPLOADS")?.bucket_name,privateBucket,"staging uploads");
  check(Object.keys(config.vars).sort().join(","),"BETTER_AUTH_URL,FINALIZE_DIAGNOSTICS,FINALIZE_DIAGNOSTIC_LIMIT","isolated vars");
  if(Object.keys(config.env??{}).length || config.services?.length || config.durable_objects?.bindings?.some(x=>x.script_name))throw new Error("Unexpected cross-environment bindings");
}
function objectPath(bucket,key) {
  if(!bucketsCreated.includes(bucket) || !key || key.includes(".."))throw new Error("Non-staging object path rejected");
  return `/r2/buckets/${bucket}/objects/${key.split("/").map(encodeURIComponent).join("/")}`;
}
try {
  const subdomain=(await cf("/workers/subdomain")).subdomain;
  if(!/^[a-z0-9-]+$/.test(subdomain??""))throw new Error("Cloudflare workers.dev unavailable");
  origin=`https://${name}.${subdomain}.workers.dev`;
  const database=await cf("/d1/database","POST",{name,primary_location_hint:"apac"});
  if(!/^[0-9a-f-]{36}$/.test(database.uuid??"") || database.uuid===productionDbId || database.name!==name)throw new Error("Staging D1 creation returned unexpected identifiers");
  databaseId=database.uuid;report.resources.databaseId=databaseId;await persist();
  for(const bucket of [publicBucket,privateBucket]){
    await cf("/r2/buckets","POST",{name:bucket});bucketsCreated.push(bucket);await persist();
  }
  const replacement={name,account_id:account,routes:[],workers_dev:true,preview_urls:false,triggers:{crons:[]},
    vars:{BETTER_AUTH_URL:origin,FINALIZE_DIAGNOSTICS:"1",FINALIZE_DIAGNOSTIC_LIMIT:String(cap)},d1_databases:[{binding:"DB",database_name:name,database_id:databaseId,migrations_dir:"./migrations"}],
    r2_buckets:[{binding:"PUBLIC_ASSETS",bucket_name:publicBucket},{binding:"PRIVATE_UPLOADS",bucket_name:privateBucket}]};
  const config={...original,...replacement};validateConfig(config);
  await writeFile("wrangler.stage.json",JSON.stringify(config));
  cli(["d1","migrations","apply","DB","--remote","--config","wrangler.stage.json"]);
  await sql("UPDATE app_metadata SET value='true' WHERE key='research_collection_enabled'");
  const now=Date.now();
  for(let i=0;i<actors.length;i+=50) {
    const group=actors.slice(i,i+50);
    await sql(`INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt)
      SELECT value,'Staging synthetic QA',value||'@example.test',1,?,? FROM json_each(?)`,[now,now,JSON.stringify(group.map(x=>x.id))]);
    await sql(`INSERT INTO session(id,token,userId,expiresAt,createdAt,updatedAt)
      SELECT json_extract(value,'$.id')||'-session',json_extract(value,'$.token'),json_extract(value,'$.id'),?,?,? FROM json_each(?)`,
      [now+3600000,now,now,JSON.stringify(group.map(x=>({id:x.id,token:x.sessionToken})))]);
    await sql(`INSERT INTO consent_records(id,user_id,consent_version,data_notice_version,research_participation,ai_chat_upload_consent)
      SELECT value||'-consent',value,?,?,1,0 FROM json_each(?)`,[consentVersion,dataNoticeVersion,JSON.stringify(group.map(x=>x.id))]);
  }
  // Compile the exact application source. The only deployed config is the verified staging config.
  const buildEnv={...process.env,WRANGLER_SEND_METRICS:"false",WRANGLER_LOG_PATH:process.env.RUNNER_TEMP+"/staging-build.log"};
  delete buildEnv.CLOUDFLARE_API_TOKEN;
  if(spawnSync("npm",["run","build"],{env:buildEnv,stdio:"inherit",timeout:300000}).status!==0)throw new Error("Build failed");
  const generated=JSON.parse(await readFile("dist/server/wrangler.json","utf8"));
  const deploy={...generated,...replacement,d1_databases:[{binding:"DB",database_name:name,database_id:databaseId}]};
  validateConfig(deploy);
  await writeFile("dist/server/wrangler.stage.json",JSON.stringify(deploy));
  cli(["secret","put","BETTER_AUTH_SECRET","--config","dist/server/wrangler.stage.json"],secret+"\n");workerCreated=true;
  await wait(10000);
  for(let i=0;;i++){
    try {cli(["deploy","--config","dist/server/wrangler.stage.json"]);break;}
    catch(e){if(i>=2||!e.cause?.message.includes("Cannot read properties of null (reading 'tag')"))throw e;await wait(10000);}
  }
  let checkName;
  for(let i=0;;i++){
    try {
      checkName="unauthenticated submission guard";
      await request(null,"/api/submissions","GET",undefined,401,5000);
      checkName="synthetic session";
      const session=await request(actors[0],"/api/auth/get-session","GET",undefined,200,5000);
      check(session?.user?.id,actors[0].id,"staging session");
      checkName="published revisions";
      const revisions=await request(null,"/api/questionnaires/revisions","GET",undefined,200,5000);
      if(!revisions?.revisions)throw new Error("Missing revision feed");
      break;
    } catch(e) {
      if(i>=20)throw new Error(`Staging readiness (${checkName}): ${e.message}`);
      await wait(3000);
    }
  }
  report.isolation={customRoutes:0,cronTriggers:0,stagingD1:true,distinctBuckets:true,verifiedSyntheticSession:true};
  report.status="running";await persist();
  await phase("published_revisions",actors,cohort,async()=>{await request(null,"/api/questionnaires/revisions");});
  let pool=await phase("pretest_open",actors,cohort,async u=>{
    const result=await request(u,"/api/questionnaires/"+encodeURIComponent("pretest:"+u.subgameId)+"/sessions","POST",undefined,201);
    check(result.questionnaire.questions.length,10,"pretest question count");
    u.pretest={sessionId:result.sessionId,questions:result.questionnaire.questions};
  });
  await seedResponses(pool,u=>[u.pretest]);
  pool=await phase("pretest_complete",pool,cohort,async u=>{await request(u,`/api/questionnaire-sessions/${u.pretest.sessionId}/complete`,"POST");});
  pool=await phase("draft_open",pool,cohort,async u=>{
    u.draft=(await request(u,"/api/submissions","POST",{subgameId:u.subgameId},201)).submission;
    check(u.draft.posttestForm.questions.length,21,"posttest question count");
  });
  await seedResponses(pool,u=>[u.draft.answerForm,u.draft.posttestForm]);
  pool=await phase("autosave_burst",pool,cohort,async u=>{
    u.question=u.draft.answerForm.questions.find(q=>q.required&&q.type==="long").id;
    u.answer="Staging autosave "+u.id;
    await request(u,`/api/questionnaire-sessions/${u.draft.answerForm.sessionId}/responses`,"PUT",{questionId:u.question,value:u.answer});
  });
  pool=await phase("ai_confirm_and_ack",pool,cohort,async u=>{
    const path=`/api/submissions/${u.draft.submissionId}`;
    await request(u,path+"/preparation","PATCH",{aiCompanionUsed:true,additionalAiLinks:[]});
    await request(u,path+"/acknowledgement","POST",{acknowledged:true,consentVersion:pdfVersion},201);
  });
  pool=await phase("answer_and_posttest_complete",pool,cohort,async u=>{
    for(const form of [u.draft.answerForm,u.draft.posttestForm])await request(u,`/api/questionnaire-sessions/${form.sessionId}/complete`,"POST");
  });
  pool=await phase("private_pdf_upload",pool,20,async u=>{
    const bytes=makePdf(u.id,u.index<8?2*1024*1024:64*1024);
    const form=new FormData();
    form.set("kind","ai_chat_pdf");form.set("file",new File([bytes],"qa.pdf",{type:"application/pdf"}));
    u.digest=createHash("sha256").update(bytes).digest("hex");u.bytes=bytes.length;
    u.uploadId=(await request(u,`/api/submissions/${u.draft.submissionId}/uploads`,"POST",form,201)).upload.id;
  });
  startTail();
  await wait(3500);
  const finalizing=pool;
  pool=await phase("finalize_burst_fifo",pool,cohort,async u=>{
    const receipt=await request(u,`/api/submissions/${u.draft.submissionId}/finalize`,"POST",undefined,201);
    check(receipt.submissionId,u.draft.submissionId,"finalization receipt ID");
    check(receipt.submissionStatus,"submitted","finalization receipt state");
    if(!receipt.submittedAt)throw new Error("Missing receipt timestamp");
  },true);
  const failed=finalizing.filter(u=>!pool.includes(u));
  const sample=failed.slice(0,100);
  for(let i=0;i<sample.length;i+=12) await Promise.all(sample.slice(i,i+12).map(async u=>{
    try {
      const receipt=await request(u,`/api/submissions/${u.draft.submissionId}/finalize`,"GET",undefined,200,8000);
      const entry=report.failedFinalize.find(row=>row.actor===u.index+1);
      if(entry)entry.recoveredStatus=receipt.submissionStatus;
    }catch{ /* Status verification is supplementary. */ }
  }));
  if(tail)tail.kill();
  pool=await phase("receipt_readback",pool,cohort,async u=>{
    const {submission}=await request(u,`/api/submissions?subgameId=${u.subgameId}`);
    check(submission.submissionId,u.draft.submissionId,"receipt ID");
    check(submission.status,"submitted","receipt status");
    check(submission.answerForm.responses[u.question],u.answer,"autosave readback");
    check(submission.uploads.aiChatPdf.id,u.uploadId,"receipt PDF");
  });
  await phase("repeat_finalize_sample",pool.slice(0,20),20,async u=>{
    const result=await request(u,`/api/submissions/${u.draft.submissionId}/finalize`,"POST");
    check(result.status,"already_submitted","idempotent finalize");
    const receipt=await request(u,`/api/submissions/${u.draft.submissionId}/finalize`);
    check(receipt.submittedAt,result.submittedAt,"same receipt timestamp");
    check(receipt.submissionId,result.submissionId,"same receipt identity");
  });
  const [counts]=await sql(`SELECT
    (SELECT COUNT(*) FROM submissions WHERE status='submitted') submitted,
    (SELECT COUNT(*) FROM activity_events WHERE event_type='submission_finalized') finalizedEvents,
    (SELECT COUNT(*) FROM responses) responses,
    (SELECT COUNT(*) FROM completion_jobs) queuedCompletion,
    (SELECT COUNT(*) FROM submissions s JOIN questionnaire_sessions qs ON qs.id=s.questionnaire_session_id WHERE s.user_id<>qs.user_id) foreignSessions`);
  const uploads=await sql("SELECT id,user_id,private_r2_key,bytes,sha256 FROM uploads WHERE status='uploaded'");
  const fileInventory=await cf(`/r2/buckets/${privateBucket}/objects?per_page=1000`);
  const objectByKey=new Map(fileInventory.map(o=>[o.key,o]));
  const actorById=new Map(actors.map(a=>[a.id,a]));
  const filesVerified=uploads.filter(u=>actorById.get(u.user_id)?.uploadId===u.id && actorById.get(u.user_id)?.digest===u.sha256
    && actorById.get(u.user_id)?.bytes===u.bytes && objectByKey.get(u.private_r2_key)?.size===u.bytes).length;
  const byteSample=uploads.slice(0,20);
  let sha256Verified=0;
  for(const row of byteSample) {
    const r=await fetch(api+objectPath(privateBucket,row.private_r2_key),{headers:{Authorization:"Bearer "+token},redirect:"error",signal:AbortSignal.timeout(30000)});
    if(r.ok && createHash("sha256").update(Buffer.from(await r.arrayBuffer())).digest("hex")===row.sha256)sha256Verified++;
  }
  report.integrity={...counts,receiptReadbacks:pool.length,uploaded:uploads.length,filesVerified,sha256Verified,sha256Sample:byteSample.length};
  const tooSlow=report.phases.find(p=>p.name==="pretest_open")?.over10s??0;
  const passed=pool.length===cohort && report.phases.every(p=>p.failed===0) && counts.submitted===cohort
    && counts.finalizedEvents===cohort && counts.queuedCompletion===cohort && counts.foreignSessions===0 && filesVerified===cohort
    && sha256Verified===byteSample.length && tooSlow===0;
  report.status=passed?"pass":"fail";
  if(!passed) report.failure="Cohort did not meet completion, integrity or 10-second pretest threshold. Larger cohorts must not start.";
  console.log("RESULT",JSON.stringify({cohort,status:report.status,integrity:report.integrity}));
} catch(e) {
  report.status="fail";report.failure=e?.message??"Unknown staging failure";console.error(report.failure);
} finally {
  // Only resources whose successful creation was recorded in this run can be removed.
  const clean=async(resource,fn)=>{
    try{await fn();report.cleanup.push({resource,status:"removed"});}
    catch(e){report.cleanup.push({resource,status:"failed",error:e?.message});}
    await persist();
  };
  if(tail && tail.exitCode===null && tail.signalCode===null)tail.kill();
  if(workerCreated)await clean("Worker",()=>cf(`/workers/scripts/${name}?force=true`,"DELETE"));
  for(const bucket of bucketsCreated)await clean(bucket,async()=>{
    for(let pass=0;pass<5;pass++){
      const list=await cf(`/r2/buckets/${bucket}/objects?per_page=1000`);
      if(!list.length)break;
      for(let i=0;i<list.length;i+=15)await Promise.all(list.slice(i,i+15).map(o=>cf(objectPath(bucket,o.key),"DELETE")));
    }
    await cf(`/r2/buckets/${bucket}`,"DELETE");
  });
  if(databaseId)await clean("D1",()=>cf(`/d1/database/${databaseId}`,"DELETE"));
  report.finishedAt=new Date().toISOString();await persist();
  if(report.status!=="pass" || report.cleanup.some(r=>r.status!=="removed"))process.exitCode=1;
}
