import { readFile, readdir } from "node:fs/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { unstable_splitSqlQuery } from "wrangler";

import { env } from "./testing/cloudflare";
import { aiChatUploadConsentVersion, consentVersion, dataNoticeVersion } from "./research-consent-copy";
import { cleanExpiredResearch } from "./research-cleanup";
import { recalculateCompletionForUser } from "./completion";
import { getSubmissionRequirements } from "./submissions/requirements";
import { isWithinPlayerMutationLimit } from "./request-limits";
import { GET as getSubmission, POST as startSubmission } from "../../app/api/submissions/route";
import { POST as consent } from "../../app/api/research-consent/route";
import { POST as acknowledge, DELETE as revokeAcknowledgement } from "../../app/api/submissions/[submissionId]/acknowledgement/route";
import { POST as upload } from "../../app/api/submissions/[submissionId]/uploads/route";
import { POST as revise } from "../../app/api/submissions/[submissionId]/revise/route";
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

  it("allows a K.A. text-or-attachment submission without post-test or AI-PDF consent", async () => {
    const created = await startSubmission(request("POST", { subgameId: kaSubgameId }, stranger));
    expect(created.status).toBe(201);
    const body = await created.json() as {
      submission: {
        acknowledgement: unknown;
        posttestForm: unknown;
        requirements: { requiresAiChatPdf: boolean; requiresPosttest: boolean };
        submissionId: string;
      };
    };
    const kaSubmissionId = body.submission.submissionId;
    expect(body.submission).toMatchObject({
      acknowledgement: null,
      posttestForm: null,
      requirements: { requiresAiChatPdf: false, requiresPosttest: false },
    });
    expect((await acknowledge(request("POST", { acknowledged: true, consentVersion: aiChatUploadConsentVersion }, stranger), context(kaSubmissionId))).status).toBe(409);
    expect((await upload(answerAttachmentRequest(), context(kaSubmissionId))).status).toBe(201);
    expect((await finalize(request("POST", undefined, stranger), context(kaSubmissionId))).status).toBe(201);
    expect(await env.DB.prepare(
      "SELECT posttest_session_id, status FROM submissions WHERE id = ? AND user_id = ?",
    ).bind(kaSubmissionId, stranger).first()).toMatchObject({ posttest_session_id: null, status: "submitted" });
    expect(await env.DB.prepare(
      `SELECT submissions.status,
              games.status AS game_status,
              subgames.status AS subgame_status,
              EXISTS(
                SELECT 1 FROM uploads
                 WHERE uploads.submission_id = submissions.id
                   AND uploads.user_id = submissions.user_id
                   AND uploads.kind = 'answer_attachment'
                   AND uploads.status IN ('uploaded', 'accepted')
              ) AS answer_attachment_uploaded,
              (SELECT value FROM app_metadata WHERE key = 'completion_auto_pass_submissions') AS auto_pass
         FROM submissions
         INNER JOIN subgames ON subgames.id = submissions.subgame_id
         INNER JOIN games ON games.id = subgames.game_id
        WHERE submissions.id = ?`,
    ).bind(kaSubmissionId).first()).toMatchObject({
      answer_attachment_uploaded: 1,
      auto_pass: "true",
      game_status: "playable",
      status: "submitted",
      subgame_status: "playable",
    });
    await expect(getSubmissionRequirements(env.DB, kaSubgameId)).resolves.toMatchObject({
      requiresAiChatPdf: false,
      requiresAnswerTextOrAttachment: true,
      requiresPosttest: false,
    });
    const savedKa = await (await getSubmission(new Request(`https://example.test/api/submissions?subgameId=${kaSubgameId}`, { headers: { "x-test-user": stranger } }))).json() as { submission: { answerForm: { sessionId: string; questions: { id: string }[] } } };
    expect((await answer(request("PUT", { questionId: savedKa.submission.answerForm.questions[0].id, value: "late attachment edit" }, stranger), sessionContext(savedKa.submission.answerForm.sessionId))).status).toBe(409);
    const completion = await recalculateCompletionForUser(stranger);
    expect(completion.completedSubgameIds).toContain(kaSubgameId);
    expect(completion.requiredSubgameIds).not.toContain(kaSubgameId);
    expect(completion.letterEligible).toBe(false);
    expect(await env.DB.prepare(
      "SELECT status FROM subgame_progress WHERE user_id = ? AND subgame_id = ?",
    ).bind(stranger, kaSubgameId).first()).toMatchObject({ status: "completed" });
    expect(await env.DB.prepare(
      "SELECT id FROM achievements WHERE user_id = ? AND achievement_key = 'subgame_completed' AND subgame_id = ?",
    ).bind(stranger, kaSubgameId).first()).not.toBeNull();
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
    expect((await finalize(request(), context(id))).status).toBe(201);
    const first = await env.DB.prepare('SELECT research_retention_expires_at FROM "user" WHERE id = ?').bind(owner).first();
    expect(first?.research_retention_expires_at).toMatch(/^2029-/);
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
  it("returns retryable overload after a committed finalize and never duplicates the receipt", async () => {
    const user = "overload-retry-owner";
    await env.DB.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 0, 0)')
      .bind(user, "QA overload", `${user}@example.test`).run();
    await consent(request("POST", { consentVersion, dataNoticeVersion, researchParticipation: true, aiChatUploadConsent: false }, user));
    const draft = await (await startSubmission(request("POST", { subgameId: kaSubgameId }, user))).json() as { submission: { submissionId: string } };
    const id = draft.submission.submissionId;
    expect((await upload(answerAttachmentRequest(user), context(id))).status).toBe(201);
    const database = env.DB;
    env.DB = {
      prepare(sql: string) {
        if (sql.includes("SELECT subgames.id, subgames.required_for_completion")) {
          throw new Error("D1_ERROR: D1 DB is overloaded. Requests queued for too long.");
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
