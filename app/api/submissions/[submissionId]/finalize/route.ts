import { env } from "cloudflare:workers";

import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { aiChatUploadConsentVersion } from "../../../../../lib/server/research-consent-copy";
import { getResearchRetentionYears } from "../../../../../lib/server/research-retention";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";
import { recalculateCompletionForUser } from "../../../../../lib/server/completion";
import { isWithinPlayerMutationLimit } from "../../../../../lib/server/request-limits";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ submissionId: string }> };

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store" }, status });
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
    posttest_session_id: string;
    questionnaire_session_id: string;
    status: string;
    subgame_id: string;
  }>();
  if (!submission) return response({ code: "SUBMISSION_NOT_FOUND" }, 404);
  if (submission.status === "submitted" || submission.status === "accepted") {
    return response({ completion: await recalculateCompletionForUser(participant.userId), status: "already_submitted" });
  }
  if (submission.status !== "draft") return response({ code: "SUBMISSION_NOT_DRAFT" }, 409);

  const sessions = await env.DB.prepare(
    `SELECT questionnaire_sessions.id, questionnaire_sessions.completed_at, questionnaires.questionnaire_key
       FROM questionnaire_sessions
       INNER JOIN questionnaires ON questionnaires.id = questionnaire_sessions.questionnaire_id
      WHERE questionnaire_sessions.id IN (?, ?) AND questionnaire_sessions.user_id = ?`,
  ).bind(submission.questionnaire_session_id, submission.posttest_session_id, participant.userId).all<{
    completed_at: string | null;
    id: string;
    questionnaire_key: string;
  }>();
  const answerSession = sessions.results.find((item) => item.id === submission.questionnaire_session_id);
  const posttestSession = sessions.results.find((item) => item.id === submission.posttest_session_id);
  if (
    !answerSession?.completed_at || !posttestSession?.completed_at ||
    answerSession.questionnaire_key !== `submission:${submission.subgame_id}` ||
    posttestSession.questionnaire_key !== `postgame:${submission.subgame_id}`
  ) return response({ code: "SUBMISSION_ANSWERS_INCOMPLETE" }, 400);

  const [upload, acknowledgement] = await Promise.all([
    env.DB.prepare(
      `SELECT id FROM uploads WHERE submission_id = ? AND user_id = ? AND kind = 'ai_chat_pdf'
        AND status IN ('uploaded', 'accepted') LIMIT 1`,
    ).bind(submissionId, participant.userId).first<{ id: string }>(),
    env.DB.prepare(
      `SELECT id FROM submission_consent_acknowledgements
        WHERE submission_id = ? AND user_id = ? AND consent_version = ?`,
    ).bind(submissionId, participant.userId, aiChatUploadConsentVersion).first<{ id: string }>(),
  ]);
  if (!upload) return response({ code: "AI_CHAT_PDF_REQUIRED" }, 400);
  if (!acknowledgement) return response({ code: "ACKNOWLEDGEMENT_REQUIRED" }, 400);

  const retentionYears = await getResearchRetentionYears();
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE submissions SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND status = 'draft'
          AND EXISTS (SELECT 1 FROM submission_consent_acknowledgements
            WHERE submission_id = submissions.id AND user_id = submissions.user_id AND consent_version = ?)
          AND EXISTS (SELECT 1 FROM consent_records WHERE user_id = submissions.user_id
            AND consent_version = ? AND research_participation = 1 AND withdrawn_at IS NULL)
          AND EXISTS (SELECT 1 FROM "user" WHERE id = submissions.user_id AND research_deletion_pending_at IS NULL
            AND (research_retention_expires_at IS NULL OR research_retention_expires_at > CURRENT_TIMESTAMP))`,
    ).bind(submissionId, participant.userId, aiChatUploadConsentVersion, participant.consentVersion),
    env.DB.prepare(
      `UPDATE "user" SET research_retention_expires_at = datetime('now', '+' || ? || ' years')
        WHERE id = ? AND changes() > 0`,
    ).bind(retentionYears, participant.userId),
    env.DB.prepare(
      `INSERT INTO activity_events (id, event_id, user_id, event_type, game_id, subgame_id, payload_json)
       SELECT ?, ?, ?, 'submission_finalized', games.id, ?, '{}'
         FROM games INNER JOIN subgames ON subgames.game_id = games.id
        WHERE subgames.id = ? AND changes() > 0`,
    ).bind(crypto.randomUUID(), crypto.randomUUID(), participant.userId, submission.subgame_id, submission.subgame_id),
  ]);

  if ((results[0]?.meta.changes ?? 0) === 0) return response({ code: "SUBMISSION_ALREADY_FINALIZED" }, 409);
  return response({ completion: await recalculateCompletionForUser(participant.userId), retentionYears, status: "submitted" }, 201);
}
