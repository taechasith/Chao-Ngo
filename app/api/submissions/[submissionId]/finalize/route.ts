import { withD1RetryableErrorHandling } from "../../../../../lib/server/d1-overload";
import { env } from "cloudflare:workers";

import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { aiChatUploadConsentVersion } from "../../../../../lib/server/research-consent-copy";
import { getResearchRetentionYears } from "../../../../../lib/server/research-retention";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";
import { recalculateCompletionForUser } from "../../../../../lib/server/completion";
import { isWithinPlayerMutationLimit } from "../../../../../lib/server/request-limits";
import { isHttpsShareUrl, validateQuestionValue, type QuestionType } from "../../../../../lib/server/questionnaires/validation";
import { getSubmissionRequirements, type SubmissionRequirements } from "../../../../../lib/server/submissions/requirements";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ submissionId: string }> };

type SubmissionSession = {
  completed_at: string | null;
  id: string;
  questionnaire_key: string;
};

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store" }, status });
}

function sessionStatement(sessionId: string | null, userId: string): D1PreparedStatement {
  return env.DB.prepare(
    `SELECT questionnaire_sessions.id, questionnaire_sessions.completed_at, questionnaires.questionnaire_key
       FROM questionnaire_sessions
       INNER JOIN questionnaires ON questionnaires.id = questionnaire_sessions.questionnaire_id
      WHERE questionnaire_sessions.id = ? AND questionnaire_sessions.user_id = ?`,
  ).bind(sessionId, userId);
}

function hasTextValue(valueJson: string | null): boolean {
  if (!valueJson) return false;
  try {
    const value = JSON.parse(valueJson) as unknown;
    return typeof value === "string" && value.trim().length > 0;
  } catch {
    return false;
  }
}

async function answerTextIsComplete(
  session: SubmissionSession | null | undefined,
  requirements: SubmissionRequirements,
  userId: string,
): Promise<boolean> {
  if (!session?.completed_at || !session.id) return false;
  if (!requirements.requiredAnswerQuestionKeys.length) return true;

  const answers = await env.DB.prepare(
    `SELECT questions.id, questions.question_key, questions.type, questions.required, questions.options_json, responses.value_json
       FROM questions
       LEFT JOIN responses ON responses.question_id = questions.id AND responses.session_id = ?
      WHERE questions.questionnaire_id = (
        SELECT questionnaire_id FROM questionnaire_sessions WHERE id = ? AND user_id = ?
      )`,
  ).bind(session.id, session.id, userId).all<{ id: string; question_key: string; type: QuestionType; required: number; options_json: string; value_json: string | null }>();
  if (requirements.requiresAnswerForm && answers.results.some(question => {
    if (!question.required) return false;
    try {
      return !validateQuestionValue({ id: question.id, questionKey: question.question_key,
        type: question.type, required: true, optionsJson: question.options_json }, JSON.parse(question.value_json ?? "null")).success;
    } catch { return true; }
  })) return false;
  const values = new Map(answers.results.map((item) => [item.question_key, item.value_json]));
  return requirements.requiredAnswerQuestionKeys.every((key) => hasTextValue(values.get(key) ?? null));
}

function finalizationUpdate(
  submissionId: string,
  userId: string,
  consentVersion: string,
  requiresAiChatPdf: boolean,
): D1PreparedStatement {
  if (requiresAiChatPdf) {
    return env.DB.prepare(
      `UPDATE submissions SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND status = 'draft'
          AND EXISTS (SELECT 1 FROM submission_consent_acknowledgements
            WHERE submission_id = submissions.id AND user_id = submissions.user_id AND consent_version = ?)
          AND EXISTS (SELECT 1 FROM consent_records WHERE user_id = submissions.user_id
            AND consent_version = ? AND research_participation = 1 AND withdrawn_at IS NULL)
          AND EXISTS (SELECT 1 FROM "user" WHERE id = submissions.user_id AND research_deletion_pending_at IS NULL
            AND (research_retention_expires_at IS NULL OR research_retention_expires_at > CURRENT_TIMESTAMP))`,
    ).bind(submissionId, userId, aiChatUploadConsentVersion, consentVersion);
  }

  return env.DB.prepare(
    `UPDATE submissions SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND status = 'draft'
        AND EXISTS (SELECT 1 FROM consent_records WHERE user_id = submissions.user_id
          AND consent_version = ? AND research_participation = 1 AND withdrawn_at IS NULL)
        AND EXISTS (SELECT 1 FROM "user" WHERE id = submissions.user_id AND research_deletion_pending_at IS NULL
          AND (research_retention_expires_at IS NULL OR research_retention_expires_at > CURRENT_TIMESTAMP))`,
  ).bind(submissionId, userId, consentVersion);
}

async function handlePOST(request: Request, context: RouteContext): Promise<Response> {
  if (!isSameOriginRequest(request)) return response({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;
  if (!(await isWithinPlayerMutationLimit(participant.userId, "submission-finalize", 12))) return response({ code: "REQUEST_RATE_LIMITED" }, 429);

  const { submissionId } = await context.params;
  const submission = await env.DB.prepare(
    `SELECT id, subgame_id, questionnaire_session_id, posttest_session_id, status
       FROM submissions WHERE id = ? AND user_id = ?`,
  ).bind(submissionId, participant.userId).first<{
    id: string;
    posttest_session_id: string | null;
    questionnaire_session_id: string | null;
    status: string;
    subgame_id: string;
  }>();
  if (!submission) return response({ code: "SUBMISSION_NOT_FOUND" }, 404);
  if (submission.status === "submitted" || submission.status === "accepted") {
    return response({ completion: await recalculateCompletionForUser(participant.userId), status: "already_submitted" });
  }
  if (submission.status !== "draft") return response({ code: "SUBMISSION_NOT_DRAFT" }, 409);

  const requirements = await getSubmissionRequirements(env.DB, submission.subgame_id, submission.questionnaire_session_id);
  const validation = await env.DB.batch([
    sessionStatement(submission.questionnaire_session_id, participant.userId),
    sessionStatement(submission.posttest_session_id, participant.userId),
    env.DB.prepare(
      `SELECT id FROM uploads WHERE submission_id = ? AND user_id = ? AND kind = 'ai_chat_pdf'
        AND status IN ('uploaded', 'accepted') LIMIT 1`,
    ).bind(submissionId, participant.userId),
    env.DB.prepare(
      `SELECT id, original_name FROM uploads WHERE submission_id = ? AND user_id = ? AND kind = 'answer_attachment'
        AND status IN ('uploaded', 'accepted') ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ).bind(submissionId, participant.userId),
    env.DB.prepare(
      `SELECT id FROM submission_consent_acknowledgements
        WHERE submission_id = ? AND user_id = ? AND consent_version = ?`,
    ).bind(submissionId, participant.userId, aiChatUploadConsentVersion),
  ]);

  const answerSession = validation[0].results[0] as SubmissionSession | undefined;
  const posttestSession = validation[1].results[0] as SubmissionSession | undefined;
  const aiChatPdf = validation[2].results[0];
  const answerAttachment = validation[3].results[0];
  const acknowledgement = validation[4].results[0];

  if (requirements.requiresAnswerAttachment) {
    const attachment = answerAttachment as { original_name: string } | undefined;
    const extension = attachment?.original_name.split(".").pop()?.toLowerCase();
    if (!extension || !requirements.allowedAnswerAttachmentExtensions.some(item => item === extension)) {
      return response({ code: "SLIDES_REQUIRED" }, 400);
    }
  }
  if (requirements.requiresAiChatLink) {
    const link = await env.DB.prepare(`SELECT r.value_json FROM responses r JOIN questions q ON q.id = r.question_id
      WHERE r.session_id = ? AND q.question_key = 'ai_chat_link'`).bind(submission.questionnaire_session_id).first<{ value_json: string }>();
    let value: unknown;
    try { value = JSON.parse(link?.value_json ?? "null"); } catch { value = null; }
    if (!isHttpsShareUrl(value)) return response({ code: "AI_CHAT_LINK_REQUIRED" }, 400);
  }
  if (requirements.requiresAnswerTextOrAttachment) {
    const answerSessionMatches = answerSession?.questionnaire_key === `submission:${submission.subgame_id}`;
    if ((requirements.requiresAnswerForm || !answerAttachment) && (!answerSessionMatches || !(await answerTextIsComplete(answerSession, requirements, participant.userId)))) {
      return response({
        code: requirements.requiredAnswerQuestionKeys.length
          ? requirements.requiresAnswerForm ? "SUBMISSION_ANSWERS_INCOMPLETE" : "ANSWER_TEXT_OR_ATTACHMENT_REQUIRED"
          : "SUBMISSION_ANSWERS_INCOMPLETE",
      }, 400);
    }
  }
  if (
    requirements.requiresPosttest &&
    (!posttestSession?.completed_at || posttestSession.questionnaire_key !== `postgame:${submission.subgame_id}`)
  ) return response({ code: "SUBMISSION_ANSWERS_INCOMPLETE" }, 400);
  if (requirements.requiresAiChatPdf && !aiChatPdf) return response({ code: "AI_CHAT_PDF_REQUIRED" }, 400);
  if (requirements.requiresAiChatPdf && !acknowledgement) return response({ code: "ACKNOWLEDGEMENT_REQUIRED" }, 400);

  const retentionYears = await getResearchRetentionYears();
  const results = await env.DB.batch([
    finalizationUpdate(
      submissionId,
      participant.userId,
      participant.consentVersion,
      requirements.requiresAiChatPdf,
    ),
    env.DB.prepare(
      `UPDATE "user" SET research_retention_expires_at = datetime('now', '+' || ? || ' years')
        WHERE id = ? AND changes() > 0`,
    ).bind(retentionYears, participant.userId),
    env.DB.prepare(
      `INSERT INTO activity_events (id, event_id, user_id, event_type, game_id, subgame_id, payload_json)
       SELECT ?, ?, ?, 'submission_finalized', games.id, ?, ?
         FROM games INNER JOIN subgames ON subgames.game_id = games.id
        WHERE subgames.id = ? AND changes() > 0`,
    ).bind(
      crypto.randomUUID(),
      crypto.randomUUID(),
      participant.userId,
      submission.subgame_id,
      JSON.stringify({ instrumentVersion: requirements.instrumentVersion }),
      submission.subgame_id,
    ),
    env.DB.prepare(`UPDATE questionnaire_sessions SET closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP)
      WHERE user_id = ? AND completed_at IS NULL AND id IN (?, ?)
      AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND user_id = ? AND status = 'submitted')`)
      .bind(participant.userId, submission.questionnaire_session_id, submission.posttest_session_id, submissionId, participant.userId),
  ]);

  if ((results[0]?.meta.changes ?? 0) === 0) return response({ code: "SUBMISSION_ALREADY_FINALIZED" }, 409);
  return response({ completion: await recalculateCompletionForUser(participant.userId), retentionYears, status: "submitted" }, 201);
}

export const POST = withD1RetryableErrorHandling(handlePOST);
