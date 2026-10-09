import { env } from "cloudflare:workers";

import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";
import { isWithinPlayerMutationLimit } from "../../../../../lib/server/request-limits";

import { refreshActiveSession, readQuestionnaireSession } from "../../../../../lib/server/questionnaires/live-updates";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ key: string }>;
};

function noStoreResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

async function getPublishedQuestionnaire(key: string) {
  if (!/^[a-z][a-z0-9:_-]{0,63}$/.test(key)) {
    return null;
  }

  return env.DB.prepare(
    `SELECT id, questionnaire_key, version, title
       FROM questionnaires
      WHERE questionnaire_key = ? AND published = 1
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1`,
  )
    .bind(key)
    .first<{
      id: string;
      questionnaire_key: string;
      title: string;
      version: string;
    }>();
}

async function getQuestions(questionnaireId: string) {
  const result = await env.DB.prepare(
    `SELECT id, question_key, prompt_th, type, required, options_json, sort_order
       FROM questions
      WHERE questionnaire_id = ?
      ORDER BY sort_order ASC`,
  )
    .bind(questionnaireId)
    .all<{
      id: string;
      options_json: string;
      prompt_th: string;
      question_key: string;
      required: number;
      sort_order: number;
      type: string;
    }>();

  return result.results.map((question) => ({
    id: question.id,
    key: question.question_key,
    options: JSON.parse(question.options_json) as unknown,
    promptTh: question.prompt_th,
    required: question.required === 1,
    type: question.type,
  }));
}

async function getActiveSession(userId: string, questionnaireId: string) {
  return env.DB.prepare(
    `SELECT id
       FROM questionnaire_sessions
      WHERE user_id = ? AND questionnaire_id = ? AND completed_at IS NULL AND closed_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1`,
  )
    .bind(userId, questionnaireId)
    .first<{ id: string }>();
}

async function getSavedResponses(sessionId: string): Promise<Record<string, unknown>> {
  const result = await env.DB.prepare(
    `SELECT question_id, value_json
       FROM responses
      WHERE session_id = ?`,
  )
    .bind(sessionId)
    .all<{ question_id: string; value_json: string }>();

  return result.results.reduce<Record<string, unknown>>((savedResponses, response) => {
    try {
      savedResponses[response.question_id] = JSON.parse(response.value_json) as unknown;
    } catch {
      // Invalid historical data is ignored so it cannot block a participant from correcting it.
    }

    return savedResponses;
  }, {});
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const participant = await requireResearchParticipant(request);

  if (participant instanceof Response) {
    return participant;
  }

  const { key } = await context.params;
  const questionnaire = await getPublishedQuestionnaire(key);

  if (!questionnaire) {
    return noStoreResponse({ code: "QUESTIONNAIRE_NOT_FOUND" }, 404);
  }

  const previous = await env.DB.prepare(`SELECT s.id,s.completed_at FROM questionnaire_sessions s JOIN questionnaires q ON q.id=s.questionnaire_id
    WHERE s.user_id=? AND q.questionnaire_key=? AND (s.closed_at IS NULL OR s.completed_at IS NOT NULL)
    ORDER BY (s.completed_at IS NULL AND s.closed_at IS NULL) DESC,s.started_at DESC,s.rowid DESC LIMIT 1`).bind(participant.userId,key).first<{id:string;completed_at:string|null}>();
  const current = previous && !previous.completed_at ? await refreshActiveSession(env.DB,participant.userId,previous.id) : null;
  const form = previous ? await readQuestionnaireSession(env.DB,participant.userId,current?.sessionId ?? previous.id) : null;
  const session = form ? {id:form.sessionId,completed_at:form.completed} : null;
  const history = form ? await env.DB.prepare(`WITH RECURSIVE chain(id,depth) AS (
    SELECT previous_session_id,0 FROM questionnaire_session_updates WHERE current_session_id=?
    UNION ALL SELECT u.previous_session_id,chain.depth+1 FROM questionnaire_session_updates u JOIN chain ON u.current_session_id=chain.id WHERE chain.depth<50)
    SELECT id FROM chain ORDER BY depth DESC`).bind(form.sessionId).all<{id:string}>() : null;
  const previousForms = history ? (await Promise.all(history.results.map(row=>readQuestionnaireSession(env.DB,participant.userId,row.id)))).filter(Boolean) : [];
  let recommendation = null;
  if (session?.completed_at && key === "pregame") {
    const stored = await env.DB.prepare("SELECT recommended_subgame_id, score_json FROM recommendation_results WHERE questionnaire_session_id = ?")
      .bind(session.id).first<{ recommended_subgame_id: string; score_json: string }>();
    if (stored) {
      const scores = JSON.parse(stored.score_json) as { candidates?: Array<{ subgameId: string; components: unknown }> };
      recommendation = scores.candidates?.find(item => item.subgameId === stored.recommended_subgame_id) ?? null;
    }
  }
  return noStoreResponse({
    questionnaire: {
      id: form?.id ?? questionnaire.id,
      key: form?.key ?? questionnaire.questionnaire_key,
      questions: form?.questions ?? await getQuestions(questionnaire.id),
      title: form?.title ?? questionnaire.title,
      version: form?.version ?? questionnaire.version,
    },
    previousForms,
    completed: Boolean(session?.completed_at),
    recommendation,
    responses: session ? await getSavedResponses(session.id) : {},
    sessionId: session?.id ?? null,
  });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (!isSameOriginRequest(request)) return noStoreResponse({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);

  if (participant instanceof Response) {
    return participant;
  }
  if (!(await isWithinPlayerMutationLimit(participant.userId, "questionnaire-session", 8))) return noStoreResponse({ code: "REQUEST_RATE_LIMITED" }, 429);

  const { key } = await context.params;
  const questionnaire = await getPublishedQuestionnaire(key);

  if (!questionnaire) {
    return noStoreResponse({ code: "QUESTIONNAIRE_NOT_FOUND" }, 404);
  }

  const prior = await env.DB.prepare(`SELECT s.id FROM questionnaire_sessions s JOIN questionnaires q ON q.id=s.questionnaire_id
    WHERE s.user_id=? AND q.questionnaire_key=? AND s.completed_at IS NULL AND s.closed_at IS NULL ORDER BY s.started_at DESC LIMIT 1`).bind(participant.userId,key).first<{id:string}>();
  if (prior) {
    const refreshed = await refreshActiveSession(env.DB,participant.userId,prior.id);
    const form = await readQuestionnaireSession(env.DB,participant.userId,refreshed.sessionId);
    if (form) return noStoreResponse({questionnaire:{id:form.id,key:form.key,questions:form.questions,title:form.title,version:form.version},responses:form.responses,sessionId:form.sessionId});
  }
  const existing = await getActiveSession(participant.userId, questionnaire.id);
  let sessionId = existing?.id;
  let created = false;

  if (!sessionId) {
    const candidateSessionId = crypto.randomUUID();

    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO questionnaire_sessions (id, user_id, questionnaire_id)
           VALUES (?, ?, ?)`,
        ).bind(candidateSessionId, participant.userId, questionnaire.id),
        env.DB.prepare(
          `INSERT INTO activity_events (
             id, event_id, user_id, event_type, payload_json
           ) VALUES (?, ?, ?, 'pregame_started', ?)`,
        ).bind(
          crypto.randomUUID(),
          crypto.randomUUID(),
          participant.userId,
          JSON.stringify({ questionnaireKey: questionnaire.questionnaire_key, version: questionnaire.version }),
        ),
      ]);
      sessionId = candidateSessionId;
      created = true;
    } catch (error) {
      const concurrentSession = await getActiveSession(participant.userId, questionnaire.id);

      if (!concurrentSession) {
        throw error;
      }

      sessionId = concurrentSession.id;
    }
  }

  return noStoreResponse(
    {
      questionnaire: {
        id: questionnaire.id,
        key: questionnaire.questionnaire_key,
        questions: await getQuestions(questionnaire.id),
        title: questionnaire.title,
        version: questionnaire.version,
      },
      responses: await getSavedResponses(sessionId),
      sessionId,
    },
    created ? 201 : 200,
  );
}
