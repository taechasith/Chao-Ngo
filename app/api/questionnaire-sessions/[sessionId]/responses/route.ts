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

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
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
    `SELECT questionnaire_id, completed_at
       FROM questionnaire_sessions
      WHERE id = ? AND user_id = ?`,
  )
    .bind(sessionId, participant.userId)
    .first<{ completed_at: string | null; questionnaire_id: string }>();

  if (!session) {
    return noStoreResponse({ code: "QUESTIONNAIRE_SESSION_NOT_FOUND" }, 404);
  }

  if (session.completed_at) {
    return noStoreResponse({ code: "QUESTIONNAIRE_SESSION_COMPLETED" }, 409);
  }

  const question = await env.DB.prepare(
    `SELECT id, question_key, type, required, options_json
       FROM questions
      WHERE id = ? AND questionnaire_id = ?`,
  )
    .bind(parsed.data.questionId, session.questionnaire_id)
    .first<{
      id: string;
      options_json: string;
      question_key: string;
      required: number;
      type: QuestionType;
    }>();

  if (!question) {
    return noStoreResponse({ code: "QUESTION_NOT_FOUND" }, 404);
  }

  if (parsed.data.value === null) {
    await env.DB.prepare(
      `DELETE FROM responses
        WHERE session_id = ? AND question_id = ?
          AND EXISTS (SELECT 1 FROM questionnaire_sessions WHERE id = ? AND completed_at IS NULL)`,
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
     SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM questionnaire_sessions WHERE id = ? AND completed_at IS NULL)
     ON CONFLICT(session_id, question_id) DO UPDATE SET
       value_json = excluded.value_json,
       saved_at = CURRENT_TIMESTAMP`,
  )
    .bind(crypto.randomUUID(), sessionId, question.id, JSON.stringify(value.value), sessionId)
    .run();

  if (!result.meta.changes) return noStoreResponse({ code: "QUESTIONNAIRE_SESSION_COMPLETED" }, 409);

  return noStoreResponse({ status: "saved" }, 200);
}
