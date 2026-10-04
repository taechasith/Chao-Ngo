import { withD1RetryableErrorHandling } from "../../../../../lib/server/d1-overload";
import { env } from "cloudflare:workers";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";
import { z } from "zod";

import { readBoundedJson } from "../../../../../lib/server/questionnaires/request";
import {
  type QuestionType,
  validateQuestionValue,
} from "../../../../../lib/server/questionnaires/validation";
import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { isWithinPlayerMutationLimit } from "../../../../../lib/server/request-limits";

export const dynamic = "force-dynamic";

const responseInputSchema = z.object({
  questionId: z.string().trim().min(1).max(128),
  value: z.unknown(),
});

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

function noStoreResponse(body: Record<string, string>, status: number): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

async function handlePUT(request: Request, context: RouteContext): Promise<Response> {
  if (!isSameOriginRequest(request)) return noStoreResponse({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);

  if (participant instanceof Response) {
    return participant;
  }
  if (!(await isWithinPlayerMutationLimit(participant.userId, "questionnaire-response", 90))) return noStoreResponse({ code: "REQUEST_RATE_LIMITED" }, 429);

  const body = await readBoundedJson(request);
  const parsed = responseInputSchema.safeParse(body);

  if (!parsed.success) {
    return noStoreResponse({ code: "INVALID_RESPONSE" }, 400);
  }

  const { sessionId } = await context.params;
  const session = await env.DB.prepare(
    `SELECT s.questionnaire_id, s.completed_at, s.closed_at,
            q.id AS question_id, q.question_key, q.type, q.required, q.options_json
       FROM questionnaire_sessions s
       LEFT JOIN questions q ON q.questionnaire_id = s.questionnaire_id AND q.id = ?
      WHERE s.id = ? AND s.user_id = ?`,
  )
    .bind(parsed.data.questionId, sessionId, participant.userId)
    .first<{ closed_at: string | null; completed_at: string | null; questionnaire_id: string; question_id: string | null; question_key: string; type: QuestionType; required: number; options_json: string }>();

  if (!session) {
    return noStoreResponse({ code: "QUESTIONNAIRE_SESSION_NOT_FOUND" }, 404);
  }

  if (session.completed_at || session.closed_at) {
    return noStoreResponse({ code: "QUESTIONNAIRE_SESSION_COMPLETED" }, 409);
  }

  if (!session.question_id) return noStoreResponse({ code: "QUESTION_NOT_FOUND" }, 404);
  const question = { ...session, id: session.question_id };

  if (parsed.data.value === null) {
    await env.DB.prepare(
      `DELETE FROM responses
        WHERE session_id = ? AND question_id = ?
          AND EXISTS (SELECT 1 FROM questionnaire_sessions WHERE id = ? AND completed_at IS NULL AND closed_at IS NULL)`,
    )
      .bind(sessionId, question.id, sessionId)
      .run();

    return noStoreResponse({ status: "saved" }, 200);
  }

  const value = validateQuestionValue(
    {
      id: question.id,
      optionsJson: question.options_json,
      questionKey: question.question_key,
      required: question.required === 1,
      type: question.type,
    },
    parsed.data.value,
  );

  if (!value.success) {
    return noStoreResponse({ code: "INVALID_RESPONSE_VALUE" }, 400);
  }

  const result = await env.DB.prepare(
    `INSERT INTO responses (id, session_id, question_id, value_json)
     SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM questionnaire_sessions WHERE id = ? AND completed_at IS NULL AND closed_at IS NULL)
     ON CONFLICT(session_id, question_id) DO UPDATE SET
       value_json = excluded.value_json,
       saved_at = CURRENT_TIMESTAMP`,
  )
    .bind(crypto.randomUUID(), sessionId, question.id, JSON.stringify(value.value), sessionId)
    .run();

  if (!result.meta.changes) return noStoreResponse({ code: "QUESTIONNAIRE_SESSION_COMPLETED" }, 409);

  return noStoreResponse({ status: "saved" }, 200);
}

export const PUT = withD1RetryableErrorHandling(handlePUT);
