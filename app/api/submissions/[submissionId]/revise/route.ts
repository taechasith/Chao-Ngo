import { withD1RetryableErrorHandling } from "../../../../../lib/server/d1-overload";
import { env } from "cloudflare:workers";
import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";
import { isWithinPlayerMutationLimit } from "../../../../../lib/server/request-limits";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function handlePOST(request: Request, context: { params: Promise<{ submissionId: string }> }) {
  if (!isSameOriginRequest(request)) return json({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const player = await requireResearchParticipant(request);
  if (player instanceof Response) return player;
  const userId = player.userId;
  if (!(await isWithinPlayerMutationLimit(userId, "submission-revise", 12))) return json({ code: "REQUEST_RATE_LIMITED" }, 429);
  const { submissionId } = await context.params;
  const original = await env.DB.prepare("SELECT subgame_id, status, questionnaire_session_id, posttest_session_id FROM submissions WHERE id = ? AND user_id = ?")
    .bind(submissionId, userId).first<{ subgame_id: string; status: string; questionnaire_session_id: string | null; posttest_session_id: string | null }>();
  if (!original) return json({ code: "SUBMISSION_NOT_FOUND" }, 404);
  const child = () => env.DB.prepare("SELECT id FROM submissions WHERE revision_of_submission_id = ? AND user_id = ?")
    .bind(submissionId, userId).first<{ id: string }>();
  const existing = await child();
  if (existing) return json({ submissionId: existing.id, status: "resumed" });
  if (original.status !== "needs_revision") return json({ code: "REVISION_NOT_REQUESTED" }, 409);
  const latest = await env.DB.prepare("SELECT id FROM submissions WHERE user_id = ? AND subgame_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .bind(userId, original.subgame_id).first<{ id: string }>();
  if (latest?.id !== submissionId) return json({ code: "SUBMISSION_CHANGED" }, 409);

  const statements: D1PreparedStatement[] = [];
  async function copyForm(oldId: string | null): Promise<string | null> {
    if (!oldId) return null;
    const form = await env.DB.prepare("SELECT questionnaire_id FROM questionnaire_sessions WHERE id = ? AND user_id = ?")
      .bind(oldId, userId).first<{ questionnaire_id: string }>();
    if (!form) throw new Error("REVISION_FORM_MISSING");
    const id = crypto.randomUUID();
    statements.push(env.DB.prepare("INSERT INTO questionnaire_sessions (id, user_id, questionnaire_id) VALUES (?, ?, ?)").bind(id, userId, form.questionnaire_id));
    const responses = await env.DB.prepare("SELECT question_id, value_json FROM responses WHERE session_id = ?")
      .bind(oldId).all<{ question_id: string; value_json: string }>();
    for (const answer of responses.results) statements.push(env.DB.prepare("INSERT INTO responses (id, session_id, question_id, value_json) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), id, answer.question_id, answer.value_json));
    return id;
  }
  const answer = await copyForm(original.questionnaire_session_id);
  const posttest = await copyForm(original.posttest_session_id);
  const id = crypto.randomUUID();
  statements.push(env.DB.prepare(
    "INSERT INTO submissions (id, user_id, subgame_id, questionnaire_session_id, posttest_session_id, status, revision_of_submission_id) VALUES (?, ?, ?, ?, ?, 'draft', ?)",
  ).bind(id, userId, original.subgame_id, answer, posttest, submissionId));
  try { await env.DB.batch(statements); }
  catch (error) { const raced = await child(); if (raced) return json({ submissionId: raced.id, status: "resumed" }); throw error; }
  return json({ submissionId: id, status: "created" }, 201);
}

export const POST = withD1RetryableErrorHandling(handlePOST);
