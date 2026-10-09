import { readFile, readdir } from "node:fs/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { unstable_splitSqlQuery } from "wrangler";

import { env } from "./testing/cloudflare";
import { aiChatUploadConsentVersion, consentVersion, dataNoticeVersion } from "./research-consent-copy";
import { cleanExpiredResearch } from "./research-cleanup";
import { recalculateCompletionForUser } from "./completion";
import { isWithinPlayerMutationLimit } from "./request-limits";
import { GET as getSubmission, POST as startSubmission } from "../../app/api/submissions/route";
import { POST as consent } from "../../app/api/research-consent/route";
import { POST as acknowledge, DELETE as revokeAcknowledgement } from "../../app/api/submissions/[submissionId]/acknowledgement/route";
import { POST as upload } from "../../app/api/submissions/[submissionId]/uploads/route";
import { POST as revise } from "../../app/api/submissions/[submissionId]/revise/route";
import { PATCH as preparation } from "../../app/api/submissions/[submissionId]/preparation/route";
import { POST as finalize } from "../../app/api/submissions/[submissionId]/finalize/route";
import { PUT as answer } from "../../app/api/questionnaire-sessions/[sessionId]/responses/route";
import { POST as complete } from "../../app/api/questionnaire-sessions/[sessionId]/complete/route";
import { GET as getQuestionnaire, POST as startQuestionnaire } from "../../app/api/questionnaires/[key]/sessions/route";
import { GET as getResearchProfile, PATCH as updateResearchProfile } from "../../app/api/player-research-profile/route";
import { GET as getPlayerNotifications } from "../../app/api/player-notifications/route";

vi.setConfig({ testTimeout: 30_000 });

vi.mock("./auth", () => ({
  getAuthReadinessForRuntime: () => ({ isReady: true }),
  getAuth: () => ({ api: { getSession: async ({ headers }: { headers: Headers }) => {
    const id = headers.get("x-test-user");
    return id ? { user: { id, emailVerified: true } } : null;
  } } }),
}));

const owner = "b6-test-owner";
const stranger = "b6-test-stranger";
const subgameId = "subgame-node-zone-quantum";
const kaSubgameId = "subgame-ka-fintech";
let mf: Miniflare;
const request = (method = "POST", body?: unknown, user: string | null = owner, origin = "https://example.test") => new Request(
  `https://example.test/api/submissions?subgameId=${subgameId}`,
  { method, headers: { Origin: origin, ...(user ? { "x-test-user": user } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) },
);
const context = (submissionId: string) => ({ params: Promise.resolve({ submissionId }) });
const sessionContext = (sessionId: string) => ({ params: Promise.resolve({ sessionId }) });
const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj <</Type /Catalog>> endobj\n%%EOF\n");
function fileRequest(bytes: Uint8Array = pdf, mime = "application/pdf", name = "chat.pdf", user = owner) {
  const form = new FormData();
  form.set("file", new File([bytes as BlobPart], name, { type: mime }));
  return new Request("https://example.test/api/upload", { method: "POST", headers: { "x-test-user": user }, body: form });
}
function answerAttachmentRequest(user = stranger) {
  const form = new FormData();
  form.set("file", new File([new TextEncoder().encode("A local K.A. answer attachment.") as BlobPart], "answer.txt", { type: "text/plain" }));
  form.set("kind", "answer_attachment");
  return new Request("https://example.test/api/upload", { method: "POST", headers: { "x-test-user": user }, body: form });
}

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: "export default {}", compatibilityDate: "2026-09-19",
    d1Databases: ["DB"], r2Buckets: ["PRIVATE_UPLOADS", "PUBLIC_ASSETS"],
  }));
  env.DB = await mf.getD1Database("DB") as unknown as D1Database;
  env.PRIVATE_UPLOADS = await mf.getR2Bucket("PRIVATE_UPLOADS") as unknown as R2Bucket;
  env.PUBLIC_ASSETS = await mf.getR2Bucket("PUBLIC_ASSETS") as unknown as R2Bucket;
  for (const name of (await readdir("migrations")).filter((name) => name.endsWith(".sql")).sort()) {
    const statements = unstable_splitSqlQuery(await readFile(`migrations/${name}`, "utf8"));
    await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
  }
  for (const id of [owner, stranger]) {
    await env.DB.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 0, 0)')
      .bind(id, "Local test participant", `${id}@example.test`).run();
  }
  await env.DB.prepare("UPDATE app_metadata SET value = 'true' WHERE key = 'research_collection_enabled'").run();
}, 30_000);
afterAll(async () => { await mf?.dispose(); });

describe("B6 real D1/private R2 contracts", () => {
  let id: string;
  let draft: { answerForm: { sessionId: string; questions: { id: string; type: string; required: boolean }[] }; posttestForm: { sessionId: string; questions: { id: string; type: string; required: boolean }[] } };
  let key: string;

  it("requires authentication, explicit consent, and same origin", async () => {
    expect((await startSubmission(request("POST", { subgameId }, null))).status).toBe(401);
    expect((await startSubmission(request("POST", { subgameId }))).status).toBe(403);
    const body = { consentVersion, dataNoticeVersion, researchParticipation: true, aiChatUploadConsent: false };
    expect((await consent(request("POST", body, owner, "https://evil.test"))).status).toBe(403);
    expect((await consent(request("POST", { ...body, consentVersion: "old" }))).status).toBe(409);
    expect((await consent(request("POST", body))).status).toBe(200);
    expect((await consent(request("POST", body, stranger))).status).toBe(200);
    const saved = await env.DB.prepare("SELECT user_id, consent_version, consented_at FROM consent_records WHERE user_id = ?").bind(owner).first();
    expect(saved).toMatchObject({ user_id: owner, consent_version: consentVersion });
    expect(saved?.consented_at).toBeTruthy();
  });

  it("creates one draft on retries and blocks ID substitution", async () => {
    const result = await startSubmission(request("POST", { subgameId }));
    expect(result.status).toBe(201);
    const body = await result.json() as { submission: typeof draft & { submissionId: string } };
    draft = body.submission;
    id = body.submission.submissionId;
    const retried = await (await startSubmission(request("POST", { subgameId }))).json() as { submission: { submissionId: string } };
    expect(retried.submission.submissionId).toBe(id);
    expect((await upload(fileRequest(pdf, "application/pdf", "chat.pdf", stranger), context(id))).status).toBe(404);
    expect((await finalize(request("POST", undefined, stranger), context(id))).status).toBe(404);
    expect((await answer(request("PUT", { questionId: draft.answerForm.questions[0].id, value: "stolen" }, stranger), sessionContext(draft.answerForm.sessionId))).status).toBe(404);
  });

  it("keeps additional AI links private, validates URLs and restores the saved draft", async () => {
    const value = { aiCompanionUsed: true, additionalAiLinks: ["https://chatgpt.com/share/qa-private"] };
    expect((await preparation(request("PATCH", value, null), context(id))).status).toBe(401);
    expect((await preparation(request("PATCH", value, owner, "https://evil.test"), context(id))).status).toBe(403);
    expect((await preparation(request("PATCH", value, stranger), context(id))).status).toBe(404);
    for (const link of ["javascript:alert(1)", "http://example.test/chat", "https://user:pass@example.test/chat", "https://127.0.0.1/chat"]) {
      expect((await preparation(request("PATCH", { ...value, additionalAiLinks: [link] }), context(id))).status).toBe(400);
    }
    expect((await preparation(request("PATCH", { ...value, additionalAiLinks: Array(6).fill("https://example.test/chat") }), context(id))).status).toBe(400);
    expect((await preparation(request("PATCH", value), context(id))).status).toBe(200);
    expect(await (await getSubmission(request("GET"))).json()).toMatchObject({ submission: { preparation: value } });
    expect((await getSubmission(request("GET", undefined, null))).status).toBe(401);
    expect((await preparation(request("PATCH", { aiCompanionUsed: false, additionalAiLinks: [] }), context(id))).status).toBe(200);
  });

  it("validates current PDF acknowledgement, MIME, signature, and limits", async () => {
    expect((await upload(fileRequest(), context(id))).status).toBe(403);
    expect((await acknowledge(request("POST", { acknowledged: true, consentVersion: "old" }), context(id))).status).toBe(400);
    expect((await acknowledge(request("POST", { acknowledged: true, consentVersion: aiChatUploadConsentVersion }), context(id))).status).toBe(201);
    expect((await upload(fileRequest(pdf, "text/html"), context(id))).status).toBe(400);
    expect((await upload(fileRequest(pdf, "application/pdf", "chat.html"), context(id))).status).toBe(400);
    expect((await upload(fileRequest(new TextEncoder().encode("not a real PDF document")), context(id))).status).toBe(400);
    const oversized = new Request("https://example.test", { method: "POST", headers: { "x-test-user": owner, "content-length": String(22 * 1024 * 1024) } });
    expect((await upload(oversized, context(id))).status).toBe(413);
    const saved = await upload(fileRequest(), context(id));
    expect(saved.status).toBe(201);
    expect(JSON.stringify(await saved.json())).not.toContain("research-uploads/");
    key = (await env.DB.prepare("SELECT private_r2_key FROM uploads WHERE submission_id = ?").bind(id).first<{ private_r2_key: string }>())!.private_r2_key;
    expect(await env.PRIVATE_UPLOADS.head(key)).not.toBeNull();
    expect(await env.PUBLIC_ASSETS.head(key)).toBeNull();
  });

  it("requires all five K.A. answers and a private AI PDF without accepting slides", async () => {
    const created = await startSubmission(request("POST", { subgameId: kaSubgameId }, stranger));
    expect(created.status).toBe(201);
    const { submission: ka } = await created.json() as { submission: {
      submissionId: string; posttestForm: unknown; requirements: unknown;
      answerForm: { sessionId: string; questions: { id: string; key: string; type: string; promptTh: string }[] };
    } };
    expect(ka).toMatchObject({ posttestForm: null, requirements: {
      requiresAnswerForm: true, requiresAnswerAttachment: false, requiresAiChatLink: false,
      requiresAiChatPdf: true, requiresPosttest: false, allowedAnswerAttachmentExtensions: [],
    } });
    expect(ka.answerForm.questions).toHaveLength(5);
    expect(ka.answerForm.questions[2].promptTh).toContain("Finance");
    expect((await finalize(request("POST", undefined, stranger), context(ka.submissionId))).status).toBe(400);
    expect((await upload(answerAttachmentRequest(), context(ka.submissionId))).status).toBe(409);
    const slides = new FormData();
    slides.set("kind", "answer_attachment");
    slides.set("file", new File([pdf as BlobPart], "QA-slides.pdf", { type: "application/pdf" }));
    const rejectedSlides = await upload(new Request("https://example.test/api/upload", { method: "POST", headers: { "x-test-user": stranger }, body: slides }), context(ka.submissionId));
    expect(rejectedSlides.status).toBe(409);
    expect(await rejectedSlides.json()).toMatchObject({ code: "ANSWER_ATTACHMENT_NOT_ALLOWED" });
    // Refusing a slide leaves every answer field mandatory.
    expect((await finalize(request("POST", undefined, stranger), context(ka.submissionId))).status).toBe(400);
    expect(ka.answerForm.questions.some(q => q.key === "ai_chat_link")).toBe(false);
    const confidence = ka.answerForm.questions.find(q => q.key === "answer_confidence")!;
    expect((await answer(request("PUT", { questionId: confidence.id, value: 6 }, stranger), sessionContext(ka.answerForm.sessionId))).status).toBe(400);
    for (const question of ka.answerForm.questions) {
      if (question.key === "answer_confidence") continue;
      const value = question.key === "ai_chat_link" ? "https://chatgpt.com/share/qa-test-conversation" : "QA local integration answer";
      expect((await answer(request("PUT", { questionId: question.id, value }, stranger), sessionContext(ka.answerForm.sessionId))).status).toBe(200);
    }
    expect((await complete(request("POST", undefined, stranger), sessionContext(ka.answerForm.sessionId))).status).toBe(400);
    expect((await answer(request("PUT", { questionId: confidence.id, value: 4 }, stranger), sessionContext(ka.answerForm.sessionId))).status).toBe(200);
    expect((await complete(request("POST", undefined, stranger), sessionContext(ka.answerForm.sessionId))).status).toBe(200);
    expect((await finalize(request("POST", undefined, stranger), context(ka.submissionId))).status).toBe(400);
    expect((await acknowledge(request("POST", { acknowledged:true,consentVersion:aiChatUploadConsentVersion }, stranger), context(ka.submissionId))).status).toBe(201);
    expect((await upload(fileRequest(pdf,"application/pdf","QA-ai.pdf",stranger), context(ka.submissionId))).status).toBe(201);
    expect(await (await finalize(request("POST", undefined, stranger), context(ka.submissionId))).json()).toMatchObject({ code: "AI_COMPANION_REQUIRED" });
    expect((await preparation(request("PATCH", { aiCompanionUsed: true, additionalAiLinks: [] }, stranger), context(ka.submissionId))).status).toBe(200);
    expect((await finalize(request("POST", undefined, stranger), context(ka.submissionId))).status).toBe(201);
    const restored = await (await getSubmission(new Request(`https://example.test/api/submissions?subgameId=${kaSubgameId}`, { headers: { "x-test-user": stranger } }))).json() as { submission: { status: string; answerForm: { responses: Record<string, unknown> } } };
    expect(restored.submission.status).toBe("submitted");
    expect(Object.keys(restored.submission.answerForm.responses)).toHaveLength(5);
    expect(restored.submission.answerForm.responses[confidence.id]).toBe(4);
    expect((await getSubmission(new Request(`https://example.test/api/submissions?subgameId=${kaSubgameId}`))).status).toBe(401);
    const stored = await env.DB.prepare("SELECT private_r2_key FROM uploads WHERE submission_id = ?").bind(ka.submissionId).first<{ private_r2_key: string }>();
    expect(await env.PRIVATE_UPLOADS.head(stored!.private_r2_key)).not.toBeNull();
    expect(await env.PUBLIC_ASSETS.head(stored!.private_r2_key)).toBeNull();
    const completion = await recalculateCompletionForUser(stranger);
    expect(completion.completedSubgameIds).toContain(kaSubgameId);
    expect((await answer(request("PUT", { questionId: confidence.id, value: 5 }, stranger), sessionContext(ka.answerForm.sessionId))).status).toBe(409);
  });

  it("uses Bio for WA VE and submits its answers with only an AI PDF", async () => {
    const created = await startSubmission(request("POST", { subgameId: "subgame-ka-wa-ve" }, stranger));
    const { submission: ka } = await created.json() as { submission: { submissionId: string; answerForm: { sessionId: string; questions: { id: string; key: string; type: string; promptTh: string }[] } } };
    expect(ka.answerForm.questions[2].promptTh).toContain("Bio");
    for (const q of ka.answerForm.questions) {
      const value = q.type === "scale" ? 3 : q.key === "ai_chat_link" ? "https://gemini.google.com/share/qa-only" : "QA Bio answer";
      expect((await answer(request("PUT", { questionId: q.id, value }, stranger), sessionContext(ka.answerForm.sessionId))).status).toBe(200);
    }
    expect((await complete(request("POST", undefined, stranger), sessionContext(ka.answerForm.sessionId))).status).toBe(200);
    expect(await (await finalize(request("POST", undefined, stranger), context(ka.submissionId))).json()).toMatchObject({ code: "AI_CHAT_PDF_REQUIRED" });
    expect((await finalize(request("POST", undefined, stranger), context(ka.submissionId))).status).toBe(400);
    expect((await acknowledge(request("POST", { acknowledged:true,consentVersion:aiChatUploadConsentVersion }, stranger), context(ka.submissionId))).status).toBe(201);
    expect((await upload(fileRequest(pdf,"application/pdf","QA-ai.pdf",stranger), context(ka.submissionId))).status).toBe(201);
    expect(await (await finalize(request("POST", undefined, stranger), context(ka.submissionId))).json()).toMatchObject({ code: "AI_COMPANION_REQUIRED" });
    expect((await preparation(request("PATCH", { aiCompanionUsed: true, additionalAiLinks: [] }, stranger), context(ka.submissionId))).status).toBe(200);
    expect((await finalize(request("POST", undefined, stranger), context(ka.submissionId))).status).toBe(201);
  });

  it("revises a legacy K.A. receipt using the new form while retaining its original answers", async () => {
    const user = "qa-legacy-revision";
    await env.DB.prepare(`INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?, 'QA legacy revision', ?,1,0,0)`).bind(user, `${user}@example.test`).run();
    await consent(request("POST", { consentVersion, dataNoticeVersion, researchParticipation: true, aiChatUploadConsent: false }, user));
    await env.DB.prepare("INSERT INTO questionnaire_sessions (id,user_id,questionnaire_id,completed_at) VALUES ('legacy-revision-session',?,'questionnaire-submission-ka-maimee-netlood-city-v1',CURRENT_TIMESTAMP)").bind(user).run();
    await env.DB.prepare("INSERT INTO responses (id,session_id,question_id,value_json) VALUES ('legacy-revision-answer','legacy-revision-session','question-submission-ka-maimee-model','\"QA original receipt\"')").run();
    await env.DB.prepare("INSERT INTO submissions (id,user_id,subgame_id,questionnaire_session_id,status) VALUES ('legacy-revision-receipt',?,'subgame-ka-fintech','legacy-revision-session','needs_revision')").bind(user).run();
    const result = await revise(request("POST",undefined,user),context("legacy-revision-receipt"));
    expect(result.status).toBe(201);
    const restored = await (await getSubmission(new Request(`https://example.test/api/submissions?subgameId=${kaSubgameId}`, { headers: { "x-test-user": user } }))).json() as { submission: { requirements: unknown; answerForm: { questions: { id: string; key: string }[]; responses: Record<string, unknown> }; previousAnswerForm: { responses: Record<string, unknown> } } };
    expect(restored.submission.requirements).toMatchObject({ instrumentVersion: "ka-submission-v3", requiresAnswerForm: true });
    expect(restored.submission.answerForm.questions).toHaveLength(5);
    const summary = restored.submission.answerForm.questions.find(q => q.key === "case_summary")!;
    expect(restored.submission.answerForm.responses[summary.id]).toBe("QA original receipt");
    expect(restored.submission.previousAnswerForm.responses["question-submission-ka-maimee-model"]).toBe("QA original receipt");
    expect(await env.DB.prepare("SELECT questionnaire_session_id FROM submissions WHERE id = 'legacy-revision-receipt'").first()).toEqual({ questionnaire_session_id: "legacy-revision-session" });
  });

  it("persists answers, rejects incomplete forms and makes completion idempotent", async () => {
    expect((await finalize(request(), context(id))).status).toBe(400);
    expect((await complete(request(), sessionContext(draft.answerForm.sessionId))).status).toBe(400);
    for (const form of [draft.answerForm, draft.posttestForm]) {
      for (const question of form.questions.filter((q) => q.required)) {
        const value = question.type === "scale" ? 3 : "A local integration test response.";
        expect((await answer(request("PUT", { questionId: question.id, value }), sessionContext(form.sessionId))).status).toBe(200);
      }
      expect((await complete(request(), sessionContext(form.sessionId))).status).toBe(200);
      expect((await complete(request(), sessionContext(form.sessionId))).status).toBe(200);
    }
    expect((await answer(request("PUT", { questionId: draft.answerForm.questions[0].id, value: "late" }), sessionContext(draft.answerForm.sessionId))).status).toBe(409);
    await revokeAcknowledgement(request("DELETE"), context(id));
    expect((await finalize(request(), context(id))).status).toBe(400);
    await acknowledge(request("POST", { acknowledged: true, consentVersion: aiChatUploadConsentVersion }), context(id));
  });

  it("finalizes once, restores the receipt and anchors retention to submission", async () => {
    expect(await (await finalize(request("POST", undefined, owner), context(id))).json()).toMatchObject({ code: "AI_COMPANION_REQUIRED" });
    expect((await preparation(request("PATCH", { aiCompanionUsed: true, additionalAiLinks: [] }, owner), context(id))).status).toBe(200);
    expect((await finalize(request(), context(id))).status).toBe(201);
    const first = await env.DB.prepare('SELECT research_retention_expires_at FROM "user" WHERE id = ?').bind(owner).first();
    expect(first?.research_retention_expires_at).toMatch(/^2029-/);
    expect((await preparation(request("PATCH", { aiCompanionUsed: false, additionalAiLinks: [] }), context(id))).status).toBe(409);
    expect((await finalize(request(), context(id))).status).toBe(200);
    expect(await env.DB.prepare('SELECT research_retention_expires_at FROM "user" WHERE id = ?').bind(owner).first()).toEqual(first);
    const restored = await (await getSubmission(request("GET"))).json() as { submission: { status: string } };
    const retried = await (await startSubmission(request("POST", { subgameId }))).json() as { submission: { submissionId: string } };
    expect(restored.submission.status).toBe("submitted");
    expect(retried.submission.submissionId).toBe(id);
    expect((await upload(fileRequest(), context(id))).status).toBe(404);
    const events = await env.DB.prepare("SELECT COUNT(*) AS n FROM activity_events WHERE user_id = ? AND event_type = 'submission_finalized'").bind(owner).first();
    expect(events?.n).toBe(1);
  });

  it("records completion, notifications, and a letter only for current required playable cases", async () => {
    expect((await recalculateCompletionForUser(owner)).letterEligible).toBe(false);
    await env.DB.prepare("UPDATE subgames SET required_for_completion = 0 WHERE id = 'subgame-node-zone-space'").run();
    const completion = await recalculateCompletionForUser(owner);
    expect(completion).toMatchObject({ allRequiredSubgamesCompleted: true, letterEligible: true, requiredSubgameIds: [subgameId] });
    expect(await env.DB.prepare("SELECT status FROM subgame_progress WHERE user_id = ? AND subgame_id = ?").bind(owner, subgameId).first()).toMatchObject({ status: "completed" });
    expect(await env.DB.prepare("SELECT status FROM thank_you_letters WHERE user_id = ?").bind(owner).first()).toMatchObject({ status: "eligible" });
    expect(await env.DB.prepare("SELECT id FROM admin_notifications WHERE user_id = ? AND type = 'letter_eligible'").bind(owner).first()).not.toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM player_notifications WHERE user_id = ? AND kind = 'letter_eligible'").bind(owner).first<{ count: number }>()).toMatchObject({ count: 1 });
    const notificationResponse = await getPlayerNotifications(request("GET"));
    expect(notificationResponse.status).toBe(200);
    expect(await notificationResponse.json()).toMatchObject({ letter: { status: "eligible" } });
    expect((await getPlayerNotifications(request("GET", undefined, null))).status).toBe(401);
    await env.DB.prepare("UPDATE submissions SET status = 'needs_revision' WHERE id = ?").bind(id).run();
    expect((await recalculateCompletionForUser(owner)).letterEligible).toBe(false);
    expect(await env.DB.prepare("SELECT status FROM thank_you_letters WHERE user_id = ?").bind(owner).first()).toMatchObject({ status: "pending" });
  });

  it("copies requested revisions without changing old answers or files and completes the latest version", async () => {
    expect((await revise(request("POST", undefined, stranger), context(id))).status).toBe(404);
    const oldAnswers = await env.DB.prepare("SELECT question_id, value_json FROM responses WHERE session_id = ? ORDER BY question_id")
      .bind(draft.answerForm.sessionId).all();
    const created = await revise(request(), context(id));
    expect(created.status).toBe(201);
    const next = await created.json() as { submissionId: string };
    expect((await (await revise(request(), context(id))).json() as typeof next).submissionId).toBe(next.submissionId);
    const loaded = await (await startSubmission(request("POST", { subgameId }))).json() as { submission: typeof draft & { submissionId: string; uploads: { aiChatPdf: unknown } } };
    expect(loaded.submission.submissionId).toBe(next.submissionId);
    expect(loaded.submission.uploads.aiChatPdf).toBeNull();
    expect(loaded.submission.answerForm.sessionId).not.toBe(draft.answerForm.sessionId);
    expect((await env.DB.prepare("SELECT question_id, value_json FROM responses WHERE session_id = ? ORDER BY question_id").bind(loaded.submission.answerForm.sessionId).all()).results).toEqual(oldAnswers.results);
    const questionId = draft.answerForm.questions[0].id;
    await answer(request("PUT", { questionId, value: "Revised QA" }), sessionContext(loaded.submission.answerForm.sessionId));
    expect(await env.DB.prepare("SELECT value_json FROM responses WHERE session_id = ? AND question_id = ?").bind(draft.answerForm.sessionId, questionId).first()).not.toEqual({ value_json: JSON.stringify("Revised QA") });
    for (const form of [loaded.submission.answerForm, loaded.submission.posttestForm]) expect((await complete(request(), sessionContext(form.sessionId))).status).toBe(200);
    expect((await finalize(request(), context(next.submissionId))).status).toBe(400);
    await acknowledge(request("POST", { acknowledged: true, consentVersion: aiChatUploadConsentVersion }), context(next.submissionId));
    expect((await upload(fileRequest(), context(next.submissionId))).status).toBe(201);
    expect(await (await finalize(request("POST", undefined, owner), context(next.submissionId))).json()).toMatchObject({ code: "AI_COMPANION_REQUIRED" });
    expect((await preparation(request("PATCH", { aiCompanionUsed: true, additionalAiLinks: [] }, owner), context(next.submissionId))).status).toBe(200);
    expect((await finalize(request(), context(next.submissionId))).status).toBe(201);
    expect((await recalculateCompletionForUser(owner)).letterEligible).toBe(true);
    expect(await env.PRIVATE_UPLOADS.head(key)).not.toBeNull();
    expect((await revise(request(), context(next.submissionId))).status).toBe(409);
  });

  it("honors legal holds, retries failed deletion, then purges only expired research", async () => {
    await env.DB.prepare(`UPDATE "user" SET research_retention_expires_at = '2020-01-01', research_retention_hold_until = '2099-01-01' WHERE id = ?`).bind(owner).run();
    expect(await cleanExpiredResearch(env)).toEqual({ completed: 0 });
    await env.DB.prepare('UPDATE "user" SET research_retention_hold_until = NULL WHERE id = ?').bind(owner).run();
    const failingBucket = { list: env.PRIVATE_UPLOADS.list.bind(env.PRIVATE_UPLOADS), delete: async () => { throw new Error("offline"); } } as unknown as R2Bucket;
    await expect(cleanExpiredResearch({ DB: env.DB, PRIVATE_UPLOADS: failingBucket })).rejects.toThrow("will retry");
    expect(await env.PRIVATE_UPLOADS.head(key)).not.toBeNull();
    expect((await startSubmission(request("POST", { subgameId }))).status).toBe(403);
    expect(await cleanExpiredResearch(env)).toEqual({ completed: 1 });
    expect(await env.PRIVATE_UPLOADS.head(key)).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM submissions WHERE id = ?").bind(id).first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM consent_records WHERE user_id = ?").bind(owner).first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM consent_records WHERE user_id = ?").bind(stranger).first()).not.toBeNull();
    expect(await env.DB.prepare('SELECT id FROM "user" WHERE id = ?').bind(owner).first()).toBeNull();
    expect(await cleanExpiredResearch(env)).toEqual({ completed: 0 });
  });

  it("throttles repeated player mutations and opens a new window after expiry", async () => {
    expect(await isWithinPlayerMutationLimit(stranger, "limit-test", 2)).toBe(true);
    expect(await isWithinPlayerMutationLimit(stranger, "limit-test", 2)).toBe(true);
    expect(await isWithinPlayerMutationLimit(stranger, "limit-test", 2)).toBe(false);
    await env.DB.prepare("UPDATE player_rate_limits SET window_started_at = '2000-01-01' WHERE rate_key = ?").bind(`limit-test:${stranger}`).run();
    expect(await isWithinPlayerMutationLimit(stranger, "limit-test", 2)).toBe(true);
  });
});


describe("attachment-only revision", () => {
  it("opens a new editable session even when the original text form was never completed", async () => {
    const original = await env.DB.prepare("SELECT id, questionnaire_session_id FROM submissions WHERE user_id = ? AND subgame_id = ?").bind(stranger, kaSubgameId).first<{ id: string; questionnaire_session_id: string }>();
    await env.DB.prepare("UPDATE submissions SET status = 'needs_revision' WHERE id = ?").bind(original!.id).run();
    const revised = await revise(request("POST", undefined, stranger), context(original!.id));
    expect(revised.status).toBe(201);
    const next = await revised.json() as { submissionId: string };
    const form = await env.DB.prepare("SELECT questionnaire_session_id FROM submissions WHERE id = ?").bind(next.submissionId).first<{ questionnaire_session_id: string }>();
    expect(form!.questionnaire_session_id).not.toBe(original!.questionnaire_session_id);
    expect(await env.DB.prepare("SELECT completed_at, closed_at FROM questionnaire_sessions WHERE id = ?").bind(form!.questionnaire_session_id).first()).toEqual({ completed_at: null, closed_at: null });
  });
});

describe("onboarding saves personal data and resumes without writing consent again", () => {
  const user = "game-profile-roundtrip";
  const routeContext = { params: Promise.resolve({ key: "pregame" }) };
  it("keeps consent, saved answers, completed result and current profile in real D1", async () => {
    await env.DB.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 0, 0)')
      .bind(user, "Synthetic fixture", "fixture@example.test").run();
    await consent(request("POST", { consentVersion, dataNoticeVersion, researchParticipation: true, aiChatUploadConsent: false }, user));
    const originalConsent = await env.DB.prepare("SELECT id, consented_at FROM consent_records WHERE user_id = ?").bind(user).first();
    const form = await (await startQuestionnaire(request("POST", undefined, user), routeContext)).json() as {
      sessionId: string;
      questionnaire: { questions: Array<{ id: string; key: string; type: string; options: Array<{ value: string }> }> };
    };
    for (const question of form.questionnaire.questions) {
      const value = question.key === "age" ? "25" : question.type === "scale" ? 3
        : question.type === "single" ? question.options[0].value
        : question.type === "multi" ? [question.options[0].value] : "Synthetic QA";
      expect((await answer(request("PUT", { questionId: question.id, value }, user), sessionContext(form.sessionId))).status).toBe(200);
    }
    const before = await (await getQuestionnaire(request("GET", undefined, user), routeContext)).json() as { sessionId: string; completed: boolean; responses: Record<string, unknown> };
    expect(before.sessionId).toBe(form.sessionId);
    expect(before.completed).toBe(false);
    expect(Object.keys(before.responses)).toHaveLength(form.questionnaire.questions.length);
    const cleared = form.questionnaire.questions.find(question => question.key === "institution")!;
    expect((await answer(request("PUT", { questionId: cleared.id, value: null }, user), sessionContext(form.sessionId))).status).toBe(200);
    const clearedForm = await (await getQuestionnaire(request("GET", undefined, user), routeContext)).json() as { responses: Record<string, unknown> };
    expect(clearedForm.responses).not.toHaveProperty(cleared.id);
    expect((await complete(request("POST", undefined, user), sessionContext(form.sessionId))).status).toBe(200);
    const resumed = await (await getQuestionnaire(request("GET", undefined, user), routeContext)).json() as { completed: boolean; sessionId: string; recommendation: { subgameId: string } };
    expect(resumed).toMatchObject({ completed: true, sessionId: form.sessionId, recommendation: { subgameId: expect.any(String) } });
    const profile = await (await getResearchProfile(request("GET", undefined, user))).json() as { profile: { age: number; personalSkills: string[] } };
    expect(profile.profile).toMatchObject({ age: 25, personalSkills: [] });
    expect((await updateResearchProfile(request("PATCH", { ...profile.profile, personalSkills: ["ทักษะ QA"] }, user))).status).toBe(200);
    const reread = await (await getResearchProfile(request("GET", undefined, user))).json() as typeof profile;
    expect(reread.profile.personalSkills).toEqual(["ทักษะ QA"]);
    const repeated = await (await complete(request("POST", undefined, user), sessionContext(form.sessionId))).json() as { recommendation: { subgameId: string } };
    expect(repeated.recommendation.subgameId).toBe(resumed.recommendation.subgameId);
    expect(await env.DB.prepare("SELECT id, consented_at FROM consent_records WHERE user_id = ?").bind(user).first()).toEqual(originalConsent);
    const foreign = await (await getQuestionnaire(request("GET", undefined, stranger), routeContext)).json() as { sessionId: unknown };
    expect(foreign.sessionId).not.toBe(form.sessionId);
  });
  it.each([
    "D1_ERROR: D1 DB is overloaded. Requests queued for too long.",
    "D1_ERROR: Network connection lost.",
  ])("recovers %s after a committed finalize without duplicating the receipt", async (errorMessage) => {
    const user = `d1-retry-${crypto.randomUUID()}`;
    await env.DB.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 0, 0)')
      .bind(user, "QA overload", `${user}@example.test`).run();
    await consent(request("POST", { consentVersion, dataNoticeVersion, researchParticipation: true, aiChatUploadConsent: false }, user));
    const draft = await (await startSubmission(request("POST", { subgameId: kaSubgameId }, user))).json() as { submission: { submissionId: string; answerForm: { sessionId: string; questions: { id: string; key: string; type: string }[] } } };
    const id = draft.submission.submissionId;
    for (const q of draft.submission.answerForm.questions) {
      const value = q.type === "scale" ? 3 : q.key === "ai_chat_link" ? "https://example.test/qa-chat" : "QA overload answer";
      expect((await answer(request("PUT", { questionId: q.id, value }, user), sessionContext(draft.submission.answerForm.sessionId))).status).toBe(200);
    }
    expect((await complete(request("POST", undefined, user), sessionContext(draft.submission.answerForm.sessionId))).status).toBe(200);
    expect((await acknowledge(request("POST", { acknowledged:true,consentVersion:aiChatUploadConsentVersion }, user), context(id))).status).toBe(201);
    expect((await upload(fileRequest(pdf,"application/pdf","QA-ai.pdf",user), context(id))).status).toBe(201);
    expect((await preparation(request("PATCH", { aiCompanionUsed: true, additionalAiLinks: [] }, user), context(id))).status).toBe(200);
    const database = env.DB;
    env.DB = {
      prepare(sql: string) {
        if (sql.includes("SELECT subgames.id, subgames.required_for_completion")) {
          throw new Error(errorMessage);
        }
        return database.prepare(sql);
      },
      batch: database.batch.bind(database),
    } as D1Database;
    try {
      const busy = await finalize(request("POST", undefined, user), context(id));
      expect(busy.status).toBe(503);
      expect(await busy.json()).toEqual({ code: "DATABASE_BUSY" });
      expect(await database.prepare("SELECT status FROM submissions WHERE id = ?").bind(id).first()).toEqual({ status: "submitted" });
    } finally {
      env.DB = database;
    }
    expect((await finalize(request("POST", undefined, user), context(id))).status).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activity_events WHERE user_id = ? AND event_type = 'submission_finalized'")
      .bind(user).first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE user_id = ?").bind(user).first()).toEqual({ n: 1 });
  });

});

describe("admin publication racing a player submit",()=>{
  it("refuses the retired form at commit time, then accepts the refreshed answers",async()=>{
    const user="live-finalize-race";
    await env.DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,0,0)').bind(user,"Synthetic QA",`${user}@example.test`).run();
    await consent(request("POST",{consentVersion,dataNoticeVersion,researchParticipation:true,aiChatUploadConsent:false},user));
    const {submission}=await (await startSubmission(request("POST",{subgameId:kaSubgameId},user))).json() as {submission:{submissionId:string;answerForm:{id:string;sessionId:string;questions:{id:string;type:string}[]}}};
    const id=submission.submissionId,old=submission.answerForm.id,next="qa-live-finalize-instrument";
    for(const q of submission.answerForm.questions) expect((await answer(request("PUT",{questionId:q.id,value:q.type==="scale"?4:"Synthetic QA preserved answer"},user),sessionContext(submission.answerForm.sessionId))).status).toBe(200);
    await complete(request("POST",undefined,user),sessionContext(submission.answerForm.sessionId));
    await acknowledge(request("POST",{acknowledged:true,consentVersion:aiChatUploadConsentVersion},user),context(id));
    await upload(fileRequest(pdf,"application/pdf","QA-ai.pdf",user),context(id));
    expect((await preparation(request("PATCH", { aiCompanionUsed: true, additionalAiLinks: [] }, user), context(id))).status).toBe(200);
    const db=env.DB;let published=false;
    env.DB={prepare:db.prepare.bind(db),batch:async(statements:D1PreparedStatement[])=>{
      if(statements.length===4&&!published) {
        published=true;
        await db.batch([
          db.prepare("UPDATE questionnaires SET published=0 WHERE id=?").bind(old),
          db.prepare("INSERT INTO questionnaires(id,questionnaire_key,version,title,published) SELECT ?,questionnaire_key,'qa-live-race',title,1 FROM questionnaires WHERE id=?").bind(next,old),
          db.prepare("INSERT INTO questions(id,questionnaire_id,question_key,prompt_th,type,required,options_json,sort_order) SELECT 'live-'||id,?,question_key,prompt_th||'?',type,required,options_json,sort_order FROM questions WHERE questionnaire_id=?").bind(next,old),
        ]);
      }
      return db.batch(statements);
    }} as D1Database;
    try {
      const stopped=await finalize(request("POST",undefined,user),context(id));
      expect(published).toBe(true);expect(stopped.status).toBe(409);expect(await stopped.json()).toEqual({code:"QUESTIONNAIRE_UPDATED"});
      expect((await db.prepare("SELECT status FROM submissions WHERE id=?").bind(id).first())?.status).toBe("draft");
      expect((await db.prepare("SELECT COUNT(*) n FROM activity_events WHERE user_id=? AND event_type='submission_finalized'").bind(user).first())?.n).toBe(0);
    } finally {env.DB=db;}
    const resumed=await (await startSubmission(request("POST",{subgameId:kaSubgameId},user))).json() as {submission:{answerForm:{sessionId:string;responses:Record<string,unknown>};uploads:unknown}};
    expect(resumed.submission.answerForm.sessionId).not.toBe(submission.answerForm.sessionId);
    expect(Object.values(resumed.submission.answerForm.responses)).toHaveLength(5);
    expect((await answer(request("PUT",{questionId:submission.answerForm.questions[0].id,value:"late old edit"},user),sessionContext(submission.answerForm.sessionId))).status).toBe(409);
    expect((await complete(request("POST",undefined,user),sessionContext(resumed.submission.answerForm.sessionId))).status).toBe(200);
    expect((await finalize(request("POST",undefined,user),context(id))).status).toBe(201);
  });
});


describe("AI PDF-only submissions across all cases", () => {
  it.each([
    "subgame-node-zone-quantum", "subgame-node-zone-space", "subgame-ka-fintech", "subgame-ka-wa-ve",
  ])("saves answers and submits %s with one private AI PDF", async (caseId) => {
    const user = `qa-pdf-only-${caseId}`;
    await env.DB.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,0,0)')
      .bind(user, "Synthetic PDF-only QA", `${user}@example.test`).run();
    expect((await consent(request("POST", { consentVersion, dataNoticeVersion, researchParticipation: true, aiChatUploadConsent: false }, user))).status).toBe(200);
    const created = await startSubmission(request("POST", { subgameId: caseId }, user));
    expect(created.status).toBe(201);
    type Form = { sessionId: string; questions: { id: string; type: string; required: boolean; options: unknown }[] };
    const { submission } = await created.json() as { submission: { submissionId: string; requirements: unknown; answerForm: Form; posttestForm: Form | null } };
    const id = submission.submissionId;
    expect(submission.requirements).toMatchObject({ requiresAnswerAttachment: false, allowedAnswerAttachmentExtensions: [], requiresAiChatPdf: true });
    expect((await upload(answerAttachmentRequest(user), context(id))).status).toBe(409);
    for (const form of [submission.answerForm, submission.posttestForm]) {
      if (!form) continue;
      for (const q of form.questions.filter(q => q.required)) {
        const choices = Array.isArray(q.options) ? q.options as { value: string }[] : [];
        const value = q.type === "scale" ? 3 : q.type === "single" ? choices[0].value : q.type === "multi" ? [choices[0].value] : "Synthetic QA answer preserved";
        expect((await answer(request("PUT", { questionId: q.id, value }, user), sessionContext(form.sessionId))).status).toBe(200);
      }
      expect((await complete(request("POST", undefined, user), sessionContext(form.sessionId))).status).toBe(200);
    }
    expect((await preparation(request("PATCH", { aiCompanionUsed: true, additionalAiLinks: [] }, user), context(id))).status).toBe(200);
    expect(await (await finalize(request("POST", undefined, user), context(id))).json()).toMatchObject({ code: "AI_CHAT_PDF_REQUIRED" });
    expect((await acknowledge(request("POST", { acknowledged: true, consentVersion: aiChatUploadConsentVersion }, user), context(id))).status).toBe(201);
    expect((await upload(fileRequest(pdf, "application/pdf", "QA-ai-only.pdf", user), context(id))).status).toBe(201);
    expect((await finalize(request("POST", undefined, user), context(id))).status).toBe(201);
    expect((await finalize(request("POST", undefined, user), context(id))).status).toBe(200);
    const receipt = await (await getSubmission(new Request(`https://example.test/api/submissions?subgameId=${caseId}`, { headers: { "x-test-user": user } }))).json() as { submission: { status: string; answerForm: { responses: Record<string, unknown> } } };
    expect(receipt.submission.status).toBe("submitted");
    expect(Object.keys(receipt.submission.answerForm.responses)).toHaveLength(submission.answerForm.questions.filter(q => q.required).length);
    const stored = await env.DB.prepare("SELECT kind, private_r2_key FROM uploads WHERE submission_id = ?").bind(id).all<{ kind: string; private_r2_key: string }>();
    expect(stored.results).toHaveLength(1);
    expect(stored.results[0].kind).toBe("ai_chat_pdf");
    expect(await env.PRIVATE_UPLOADS.head(stored.results[0].private_r2_key)).not.toBeNull();
    expect(await env.PUBLIC_ASSETS.head(stored.results[0].private_r2_key)).toBeNull();
  });
});
