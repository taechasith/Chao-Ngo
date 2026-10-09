import { readFile, readdir } from "node:fs/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { unstable_splitSqlQuery } from "wrangler";
import { env } from "../testing/cloudflare";
import { currentSessionId, readQuestionnaireSession, refreshActiveSession } from "./live-updates";
import { POST as refresh } from "../../../app/api/questionnaire-sessions/[sessionId]/refresh/route";
import { GET as revisions } from "../../../app/api/questionnaires/revisions/route";
import { GET as resume } from "../../../app/api/questionnaires/[key]/sessions/route";
vi.mock("../research-access",()=>({requireResearchParticipant:async(request:Request)=>request.headers.get("x-test-user") ? {userId:request.headers.get("x-test-user")} : Response.json({code:"UNAUTHENTICATED"},{status:401})}));
vi.mock("../request-limits",()=>({isWithinPlayerMutationLimit:async()=>true}));
let mf:Miniflare;
let seq=0;
beforeAll(async()=>{
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {}",compatibilityDate:"2026-09-19",d1Databases:["DB"]}));
  env.DB=await mf.getD1Database("DB") as unknown as D1Database;
  for(const name of (await readdir("migrations")).filter(n=>n.endsWith(".sql")).sort()) await env.DB.batch(unstable_splitSqlQuery(await readFile(`migrations/${name}`,"utf8")).map(sql=>env.DB.prepare(sql)));
  for(const id of ["live-owner","live-stranger"]) await env.DB.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,0,0)').bind(id,id,`${id}@example.test`).run();
},30000);
afterAll(async()=>{await mf?.dispose();});
async function fixture(mode:"draft"|"submitted"|"pregame"|"completed"="draft",changed=false) {
  const prefix=`live-${++seq}`,old=`${prefix}-v1`,next=`${prefix}-v2`,session=`${prefix}-s`,key=`live:${prefix}`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO questionnaires(id,questionnaire_key,version,title,published) VALUES (?,?, '1','old',0),(?,?,'2','new',1)").bind(old,key,next,key),
    env.DB.prepare("INSERT INTO questions(id,questionnaire_id,question_key,prompt_th,type,required,options_json,sort_order) VALUES (?,?,'summary','Old prompt','long',1,'{}',1),(?,?,'summary','New prompt','long',1,'{}',1),(?,?,'confidence','Confidence','scale',1,'{\"min\":1,\"max\":5}',2),(?,?,'confidence','Confidence updated','scale',1,?,2)").bind(old+"-q",old,next+"-q",next,old+"-c",old,next+"-c",next,changed?' {"min":1,"max":3}':'{"min":1,"max":5}'),
    env.DB.prepare("INSERT INTO questionnaire_sessions(id,user_id,questionnaire_id,completed_at) VALUES (?,'live-owner',?,?)").bind(session,old,["submitted","completed"].includes(mode)?"2026-10-01":null),
    env.DB.prepare("INSERT INTO responses(id,session_id,question_id,value_json) VALUES (?,?,?,?), (?,?,?,'4')").bind(prefix+"-r",session,old+"-q",JSON.stringify("Saved draft answer"),prefix+"-rc",session,old+"-c"),
  ]);
  if(mode==="draft"||mode==="submitted") {
    const game=mode==="draft" ? "subgame-ka-fintech" : "subgame-ka-wa-ve";
    // Finish older fixtures so each test owns a distinct active draft.
    await env.DB.prepare("UPDATE submissions SET status='needs_revision' WHERE user_id='live-owner' AND status='draft'").run();
    await env.DB.prepare("INSERT INTO submissions(id,user_id,subgame_id,questionnaire_session_id,status) VALUES (?,'live-owner',?,?,?)").bind(prefix,game,session,mode).run();
    await env.DB.prepare("INSERT INTO uploads(id,submission_id,user_id,kind,private_r2_key,original_name,stored_name,bytes,mime_declared,status) VALUES (?,?,'live-owner','answer_attachment',?,'QA.pdf','QA.pdf',100,'application/pdf','uploaded')").bind(prefix+"-u",prefix,prefix+"-private").run();
  }
  return {prefix,old,next,session,key};
}
const req=(user="live-owner",origin="https://example.test")=>new Request("https://example.test/api/refresh",{method:"POST",headers:{Origin:origin,"x-test-user":user}});
describe("published edits reach open forms without losing receipts",()=>{
  it("copies saved compatible answers atomically, retains history and private file references",async()=>{
    const f=await fixture();
    const rotated=await refreshActiveSession(env.DB,"live-owner",f.session);
    expect(rotated.updated).toBe(true);
    const form=await readQuestionnaireSession(env.DB,"live-owner",rotated.sessionId);
    expect(form).toMatchObject({id:f.next,completed:false,responses:{[f.next+"-q"]:"Saved draft answer",[f.next+"-c"]:4}});
    expect((await readQuestionnaireSession(env.DB,"live-owner",f.session))?.responses[f.old+"-q"]).toBe("Saved draft answer");
    expect((await env.DB.prepare("SELECT closed_at FROM questionnaire_sessions WHERE id=?").bind(f.session).first())?.closed_at).toBeTruthy();
    expect((await env.DB.prepare("SELECT questionnaire_session_id FROM submissions WHERE id=?").bind(f.prefix).first())?.questionnaire_session_id).toBe(rotated.sessionId);
    expect((await env.DB.prepare("SELECT private_r2_key FROM uploads WHERE submission_id=?").bind(f.prefix).first())?.private_r2_key).toBe(f.prefix+"-private");
    expect((await env.DB.prepare("SELECT previous_session_id FROM submission_form_history WHERE submission_id=?").bind(f.prefix).first())?.previous_session_id).toBe(f.session);
    expect((await refreshActiveSession(env.DB,"live-owner",rotated.sessionId)).updated).toBe(false);
  });
  it("requires review when choices change, retaining the old value in history",async()=>{
    const f=await fixture("draft",true),r=await refreshActiveSession(env.DB,"live-owner",f.session);
    expect((await readQuestionnaireSession(env.DB,"live-owner",r.sessionId))?.responses[f.next+"-c"]).toBeUndefined();
    expect((await readQuestionnaireSession(env.DB,"live-owner",f.session))?.responses[f.old+"-c"]).toBe(4);
  });
  it("resolves two simultaneous tabs to one current session",async()=>{
    const f=await fixture("pregame");
    const results=await Promise.all([refreshActiveSession(env.DB,"live-owner",f.session),refreshActiveSession(env.DB,"live-owner",f.session)]);
    expect(results[0].sessionId).toBe(results[1].sessionId);
    expect(await currentSessionId(env.DB,"live-owner",f.session)).toBe(results[0].sessionId);
    const count=await env.DB.prepare("SELECT COUNT(*) n FROM questionnaire_sessions WHERE questionnaire_id=?").bind(f.next).first<{n:number}>();
    expect(count?.n).toBe(1);
  });
  it.each(["submitted","completed"] as const)("keeps %s sessions frozen",async mode=>{
    const f=await fixture(mode),r=await refreshActiveSession(env.DB,"live-owner",f.session);
    expect(r).toEqual({sessionId:f.session,updated:false});
    expect((await readQuestionnaireSession(env.DB,"live-owner",f.session))?.id).toBe(f.old);
  });
  it("refreshes an active pregame on resume and returns its original answers as history",async()=>{
    const f=await fixture("pregame");
    const response=await resume(new Request("https://example.test/api/session",{headers:{"x-test-user":"live-owner"}}),{params:Promise.resolve({key:f.key})});
    const result=await response.json() as {questionnaire:{id:string};previousForms:unknown[];responses:Record<string,unknown>};
    expect(result.questionnaire.id).toBe(f.next);expect(result.previousForms).toHaveLength(1);expect(result.responses[f.next+"-q"]).toBe("Saved draft answer");
  });
  it("blocks foreign session IDs, unsigned callers and cross-origin writes",async()=>{
    const f=await fixture("pregame"),context={params:Promise.resolve({sessionId:f.session})};
    expect((await refresh(req("live-stranger"),context)).status).toBe(404);
    expect((await refresh(new Request("https://example.test/api/refresh",{method:"POST",headers:{Origin:"https://example.test"}}),context)).status).toBe(401);
    expect((await refresh(req("live-owner","https://evil.test"),context)).status).toBe(403);
    expect(await currentSessionId(env.DB,"live-owner",f.session)).toBe(f.session);
    expect((await refresh(req(),context)).status).toBe(200);
  });
  it("coalesces public revision requests and exposes only instrument IDs",async()=>{
    const database=env.DB;
    const spy=vi.fn(database.prepare.bind(database));
    env.DB={prepare:spy,batch:database.batch.bind(database)} as unknown as D1Database;
    const responses=await Promise.all(Array.from({length:30},()=>revisions()));
    expect(spy.mock.calls.filter(([sql])=>String(sql).startsWith("SELECT questionnaire_key,id"))).toHaveLength(1);
    const result=await responses[0].text();expect(result).not.toContain("Saved draft answer");expect(result).not.toContain("scoring");expect(result).not.toContain("live-owner");env.DB=database;
  });
});
