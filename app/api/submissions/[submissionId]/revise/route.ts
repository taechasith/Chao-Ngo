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
  const migratedForms: Array<{ previous: string; current: string }> = [];
  async function copyForm(oldId: string | null): Promise<string | null> {
    if (!oldId) return null;
    const form = await env.DB.prepare(`SELECT s.questionnaire_id, q.questionnaire_key, q.version
      FROM questionnaire_sessions s JOIN questionnaires q ON q.id = s.questionnaire_id WHERE s.id = ? AND s.user_id = ?`)
      .bind(oldId, userId).first<{ questionnaire_id: string; questionnaire_key: string; version: string }>();
    if (!form) throw new Error("REVISION_FORM_MISSING");
    const current = form.questionnaire_key.startsWith("submission:subgame-ka-")
      ? await env.DB.prepare("SELECT id, version FROM questionnaires WHERE questionnaire_key = ? AND published = 1 ORDER BY created_at DESC LIMIT 1")
        .bind(form.questionnaire_key).first<{ id: string; version: string }>()
      : null;
    const upgraded = current?.version === "ka-submission-v2" && form.version !== current.version;
    const questionnaireId = upgraded ? current.id : form.questionnaire_id;
    const id = crypto.randomUUID();
    statements.push(env.DB.prepare("INSERT INTO questionnaire_sessions (id, user_id, questionnaire_id) VALUES (?, ?, ?)").bind(id, userId, questionnaireId));
    if (upgraded) migratedForms.push({ previous: oldId, current: id });
    const responses = upgraded
      ? await env.DB.prepare(`SELECT new_q.id AS question_id, r.value_json FROM responses r
          JOIN questions old_q ON old_q.id = r.question_id
          JOIN questions new_q ON new_q.questionnaire_id = ? AND new_q.question_key =
            CASE old_q.question_key WHEN 'case_truth_model' THEN 'case_summary'
              WHEN 'evidence_reasoning' THEN 'reasoning' WHEN 'prevention_system' THEN 'innovation' END
          WHERE r.session_id = ?`).bind(questionnaireId, oldId).all<{ question_id: string; value_json: string }>()
      : await env.DB.prepare("SELECT question_id, value_json FROM responses WHERE session_id = ?")
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
  for (const migratedForm of migratedForms) statements.push(env.DB.prepare("INSERT INTO submission_form_migrations (submission_id, previous_session_id, current_session_id) VALUES (?, ?, ?)")
    .bind(id, migratedForm.previous, migratedForm.current));
  try { await env.DB.batch(statements); }
  catch (error) { const raced = await child(); if (raced) return json({ submissionId: raced.id, status: "resumed" }); throw error; }
  return json({ submissionId: id, status: "created" }, 201);
}

export const POST = withD1RetryableErrorHandling(handlePOST);
