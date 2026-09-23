import { env } from "cloudflare:workers";

import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { aiChatUploadConsentVersion } from "../../../../../lib/server/research-consent-copy";
import { getResearchRetentionYears } from "../../../../../lib/server/research-retention";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";
import { recalculateCompletionForUser } from "../../../../../lib/server/completion";
import { isWithinPlayerMutationLimit } from "../../../../../lib/server/request-limits";
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

async function loadSession(sessionId: string | null, userId: string): Promise<SubmissionSession | null> {
  if (!sessionId) return null;
  return env.DB.prepare(
    `SELECT questionnaire_sessions.id, questionnaire_sessions.completed_at, questionnaires.questionnaire_key
       FROM questionnaire_sessions
       INNER JOIN questionnaires ON questionnaires.id = questionnaire_sessions.questionnaire_id
      WHERE questionnaire_sessions.id = ? AND questionnaire_sessions.user_id = ?`,
  ).bind(sessionId, userId).first<SubmissionSession>();
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
  session: SubmissionSession | null,
  requirements: SubmissionRequirements,
  userId: string,
): Promise<boolean> {
  if (!session?.completed_at || !session.id) return false;
  if (!requirements.requiredAnswerQuestionKeys.length) return true;

  const answers = await env.DB.prepare(
    `SELECT questions.question_key, responses.value_json
       FROM questions
       LEFT JOIN responses ON responses.question_id = questions.id AND responses.session_id = ?
      WHERE questions.questionnaire_id = (
        SELECT questionnaire_id FROM questionnaire_sessions WHERE id = ? AND user_id = ?
      )`,
  ).bind(session.id, session.id, userId).all<{ question_key: string; value_json: string | null }>();
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

export async function POST(request: Request, context: RouteContext): Promise<Response> {
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

  const requirements = await getSubmissionRequirements(env.DB, submission.subgame_id);
  const [answerSession, posttestSession, aiChatPdf, answerAttachment, acknowledgement] = await Promise.all([
    loadSession(submission.questionnaire_session_id, participant.userId),
    loadSession(submission.posttest_session_id, participant.userId),
    env.DB.prepare(
      `SELECT id FROM uploads WHERE submission_id = ? AND user_id = ? AND kind = 'ai_chat_pdf'
        AND status IN ('uploaded', 'accepted') LIMIT 1`,
    ).bind(submissionId, participant.userId).first<{ id: string }>(),
    env.DB.prepare(
      `SELECT id FROM uploads WHERE submission_id = ? AND user_id = ? AND kind = 'answer_attachment'
        AND status IN ('uploaded', 'accepted') LIMIT 1`,
    ).bind(submissionId, participant.userId).first<{ id: string }>(),
    env.DB.prepare(
      `SELECT id FROM submission_consent_acknowledgements
        WHERE submission_id = ? AND user_id = ? AND consent_version = ?`,
    ).bind(submissionId, participant.userId, aiChatUploadConsentVersion).first<{ id: string }>(),
  ]);

  if (requirements.requiresAnswerTextOrAttachment) {
    const answerSessionMatches = answerSession?.questionnaire_key === `submission:${submission.subgame_id}`;
    if (!answerAttachment && (!answerSessionMatches || !(await answerTextIsComplete(answerSession, requirements, participant.userId)))) {
      return response({
        code: requirements.requiredAnswerQuestionKeys.length
          ? "ANSWER_TEXT_OR_ATTACHMENT_REQUIRED"
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
  ]);

  if ((results[0]?.meta.changes ?? 0) === 0) return response({ code: "SUBMISSION_ALREADY_FINALIZED" }, 409);
  return response({ completion: await recalculateCompletionForUser(participant.userId), retentionYears, status: "submitted" }, 201);
}
