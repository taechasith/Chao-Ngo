import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { env } from './testing/cloudflare';
import { hasRequiredCasePretest } from './questionnaires/pretest';
import { GET as read, POST as start } from '../../app/api/questionnaires/[key]/sessions/route';
import { PUT as answer } from '../../app/api/questionnaire-sessions/[sessionId]/responses/route';
import { POST as complete } from '../../app/api/questionnaire-sessions/[sessionId]/complete/route';
import { POST as draft } from '../../app/api/submissions/route';
import { POST as finalize } from '../../app/api/submissions/[submissionId]/finalize/route';
import { recalculateCompletionForUser } from './completion';
import { getSubmissionRequirements } from './submissions/requirements';
vi.mock('./research-access', () => ({requireResearchParticipant: async (request: Request) => request.headers.get('x-test-user') ? {userId:request.headers.get('x-test-user'), minimumParticipantAge:0} : Response.json({code:'UNAUTHENTICATED'}, {status:401})}));
vi.mock('./request-limits', () => ({isWithinPlayerMutationLimit:async()=>true}));
let mf: Miniflare;
const owner='cq2-qa';
const cases=['subgame-node-zone-quantum','subgame-node-zone-space','subgame-ka-wa-ve','subgame-ka-fintech'];
const req=(method='POST', body?:unknown)=>new Request('https://example.test/api/questions',{method,headers:{Origin:'https://example.test','x-test-user':owner,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const ctx=(key:string)=>({params:Promise.resolve({key})});
type Form={sessionId:string;questionnaire:{id:string;questions:Array<{id:string;type:string;required:boolean;options:unknown}>}};
type DraftPayload={submission:{submissionId:string;answerForm:{id:string;sessionId:string;questions:Form['questionnaire']['questions']};posttestForm:{id:string;sessionId:string;questions:Form['questionnaire']['questions']};requirements:unknown;previousAnswerForms:unknown[]}};
async function fill(form:Form) {
  for (const q of form.questionnaire.questions) {
    if (!q.required) continue;
    const options=q.options as Array<{value:string}>;
    const value=q.type==='single' ? options.at(-1)!.value : q.type==='scale' ? 3 : q.type==='multi' ? [options[0].value] : q.id.endsWith('-age') ? '12' : 'QA test answer';
    expect((await answer(req('PUT',{questionId:q.id,value}),{params:Promise.resolve({sessionId:form.sessionId})})).status).toBe(200);
  }
  expect((await complete(req(),{params:Promise.resolve({sessionId:form.sessionId})})).status).toBe(200);
}
beforeAll(async()=>{
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {}',compatibilityDate:'2026-09-19',d1Databases:['DB']}));
  env.DB=await mf.getD1Database('DB') as unknown as D1Database;
  for (const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql') && n<'0023').sort()) await env.DB.batch(unstable_splitSqlQuery(await readFile(`migrations/${name}`,'utf8')).map(sql=>env.DB.prepare(sql)));
  await env.DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?, ?, ?,1,0,0)').bind(owner,'QA','cq2@example.test').run();
  await env.DB.prepare("INSERT INTO questionnaire_sessions(id,user_id,questionnaire_id,completed_at) VALUES ('cq2-old-receipt',?,'questionnaire-submission-ka-maimee-v3',CURRENT_TIMESTAMP)").bind(owner).run();
  await env.DB.prepare("INSERT INTO responses(id,session_id,question_id,value_json) SELECT 'cq2-old-answer','cq2-old-receipt',id,'\"Original answer\"' FROM questions WHERE questionnaire_id='questionnaire-submission-ka-maimee-v3' AND question_key='case_summary'").run();
  await env.DB.batch(unstable_splitSqlQuery(await readFile('migrations/0023_question_pack_v2.sql','utf8')).map(sql=>env.DB.prepare(sql)));
},30000);
afterAll(async()=>{await mf?.dispose();});
it('returns a retryable response when D1 cannot load or start a pretest', async () => {
  for (const handler of [read, start]) {
    const database = env.DB;
    env.DB = { prepare: () => { throw new Error('D1_ERROR: D1 DB is overloaded. Requests queued for too long.'); } } as unknown as D1Database;
    try {
      const response = await handler(req(handler === read ? 'GET' : 'POST'),ctx(`pretest:${cases[0]}`));
      expect(response.status).toBe(503); expect(response.headers.get('Retry-After')).toBe('2');
      expect(await response.json()).toEqual({code:'DATABASE_BUSY'});
    } finally { env.DB = database; }
  }
});
it('creates 13 versioned instruments, preserving historical answers and disabling candidate grading',async()=>{
  expect(await env.DB.prepare("SELECT COUNT(*) n FROM questionnaires WHERE id LIKE 'cq2-%' AND published=1").first()).toEqual({n:13});
  expect(await env.DB.prepare("SELECT COUNT(*) n FROM questions WHERE id LIKE 'cq2-%' AND scoring_json IS NULL").first()).toEqual({n:162});
  expect(await env.DB.prepare("SELECT value_json FROM responses WHERE id='cq2-old-answer'").first()).toEqual({value_json:'"Original answer"'});
  const form=await (await read(req('GET'),ctx(`pretest:${cases[0]}`))).json();
  expect(JSON.stringify(form)).not.toMatch(/scoring_json|source_note|correctAnswer|advisor_review_status/);
});
it('does not revoke completion for accepted legacy K.A. receipts with no posttest',async()=>{
  await env.DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,0,0)').bind('cq2-legacy','QA','legacy@example.test').run();
  await env.DB.prepare("INSERT INTO questionnaire_sessions(id,user_id,questionnaire_id,completed_at) VALUES ('cq2-frozen-session','cq2-legacy','questionnaire-submission-ka-maimee-v3',CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("INSERT INTO submissions(id,user_id,subgame_id,questionnaire_session_id,status) VALUES ('cq2-frozen-receipt','cq2-legacy','subgame-ka-fintech','cq2-frozen-session','accepted')").run();
  expect((await recalculateCompletionForUser('cq2-legacy')).completedSubgameIds).toContain('subgame-ka-fintech');
});
it('onboarding accepts the new demographics, saves age 12 and recommends a case',async()=>{
  const form=await (await start(req(),ctx('pregame'))).json() as Form;
  await fill(form);
  expect(await env.DB.prepare('SELECT age,education_level FROM user_profiles WHERE user_id=?').bind(owner).first()).toEqual({age:12,education_level:'prefer_not_to_say'});
});
it.each(cases)('gates %s, saves its baseline once, and requires AI PDF plus posttest',async subgameId=>{
  expect(await hasRequiredCasePretest(env.DB,owner,subgameId)).toBe(false);
  expect((await draft(req('POST',{subgameId}))).status).toBe(409);
  expect((await read(req('GET'),ctx(`postgame:${subgameId}`))).status).toBe(409);
  const started=await start(req(),ctx(`pretest:${subgameId}`)); expect(started.status).toBe(201);
  const baseline=await started.json() as Form; expect(baseline.questionnaire.questions).toHaveLength(10);
  await fill(baseline); expect(await hasRequiredCasePretest(env.DB,owner,subgameId)).toBe(true);
  expect(await (await read(req('GET'),ctx(`pretest:${subgameId}`))).json()).toMatchObject({completed:true,sessionId:baseline.sessionId});
  expect(await (await start(req(),ctx(`pretest:${subgameId}`))).json()).toMatchObject({completed:true,sessionId:baseline.sessionId});
  const created=await draft(req('POST',{subgameId}));expect(created.status).toBe(201);
  const {submission}=await created.json() as DraftPayload;
  expect(submission.answerForm.questions).toHaveLength(subgameId.includes('-ka-')?7:5);
  expect(submission.posttestForm.questions).toHaveLength(21);
  expect(submission.requirements).toMatchObject({requiresAiChatPdf:true,requiresAnswerAttachment:false,requiresAiChatLink:false,requiresPosttest:true});
  for (const form of [submission.answerForm,submission.posttestForm]) await fill({sessionId:form.sessionId,questionnaire:{id:form.id,questions:form.questions}});
  const blocked=await finalize(req(),{params:Promise.resolve({submissionId:submission.submissionId})});
  expect(blocked.status).toBe(400); expect(await blocked.json()).toMatchObject({code:'AI_CHAT_PDF_REQUIRED'});
  expect(await getSubmissionRequirements(env.DB,subgameId,submission.answerForm.sessionId)).toMatchObject({requiresAiChatPdf:true,requiresPosttest:true});
});
it('upgrades a legacy K.A. draft without a posttest while preserving its old response',async()=>{
  await env.DB.prepare("UPDATE submissions SET status='needs_revision' WHERE user_id=? AND subgame_id='subgame-ka-fintech'").bind(owner).run();
  await env.DB.prepare("INSERT INTO submissions(id,user_id,subgame_id,questionnaire_session_id,status) VALUES ('cq2-legacy-draft',?,'subgame-ka-fintech','cq2-old-receipt','draft')").bind(owner).run();
  const result=await (await draft(req('POST',{subgameId:'subgame-ka-fintech'}))).json() as DraftPayload;
  expect(result.submission.posttestForm.questions).toHaveLength(21);
  expect(result.submission.previousAnswerForms).toHaveLength(1);
  expect(await env.DB.prepare("SELECT value_json FROM responses WHERE id='cq2-old-answer'").first()).toEqual({value_json:'"Original answer"'});
  expect((await (await draft(req('POST',{subgameId:'subgame-ka-fintech'}))).json() as DraftPayload).submission.posttestForm.sessionId).toBe(result.submission.posttestForm.sessionId);
});
