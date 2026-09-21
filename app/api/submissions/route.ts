import { env } from "cloudflare:workers";

import { requireResearchParticipant } from "../../../lib/server/research-access";
import { readBoundedJson } from "../../../lib/server/questionnaires/request";
import { isSameOriginRequest } from "../../../lib/server/request-security";
import { aiChatUploadConsentVersion } from "../../../lib/server/research-consent-copy";
import { isWithinPlayerMutationLimit } from "../../../lib/server/request-limits";

export const dynamic = "force-dynamic";

type RouteQuestionnaire = {
  completed: boolean;
  id: string;
  key: string;
  questions: Array<{
    id: string;
    key: string;
    options: unknown;
    promptTh: string;
    required: boolean;
    type: string;
  }>;
  responses: Record<string, unknown>;
  sessionId: string;
  title: string;
  version: string;
};

type SubmissionRow = {
  id: string;
  posttest_session_id: string;
  questionnaire_session_id: string;
  status: string;
  subgame_id: string;
  user_id: string;
};

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store" }, status });
}

async function loadQuestionnaire(sessionId: string): Promise<RouteQuestionnaire | null> {
  const session = await env.DB.prepare(
    `SELECT questionnaire_sessions.questionnaire_id, questionnaire_sessions.id, questionnaire_sessions.completed_at,
            questionnaires.questionnaire_key, questionnaires.title, questionnaires.version
       FROM questionnaire_sessions
       INNER JOIN questionnaires ON questionnaires.id = questionnaire_sessions.questionnaire_id
      WHERE questionnaire_sessions.id = ?`,
  ).bind(sessionId).first<{
    id: string;
    questionnaire_id: string;
    questionnaire_key: string;
    title: string;
    version: string;
    completed_at: string | null;
  }>();

  if (!session) return null;

  const [questions, saved] = await Promise.all([
    env.DB.prepare(
      `SELECT id, question_key, prompt_th, type, required, options_json
         FROM questions WHERE questionnaire_id = ? ORDER BY sort_order ASC`,
    ).bind(session.questionnaire_id).all<{
      id: string;
      options_json: string;
      prompt_th: string;
      question_key: string;
      required: number;
      type: string;
    }>(),
    env.DB.prepare("SELECT question_id, value_json FROM responses WHERE session_id = ?")
      .bind(sessionId).all<{ question_id: string; value_json: string }>(),
  ]);

  const responses = Object.fromEntries(saved.results.map((row) => {
    try {
      return [String(row.question_id), JSON.parse(String(row.value_json)) as unknown];
    } catch {
      return [String(row.question_id), null];
    }
  }));

  return {
    id: session.questionnaire_id,
    key: session.questionnaire_key,
    questions: questions.results.map((row) => ({
      id: String(row.id),
      key: String(row.question_key),
      options: JSON.parse(String(row.options_json)) as unknown,
      promptTh: String(row.prompt_th),
      required: Number(row.required) === 1,
      type: String(row.type),
    })),
    responses,
    sessionId,
    completed: Boolean(session.completed_at),
    title: session.title,
    version: session.version,
  };
}

async function loadSubmission(row: SubmissionRow) {
  const [answerForm, posttestForm, upload, acknowledgement] = await Promise.all([
    loadQuestionnaire(row.questionnaire_session_id),
    loadQuestionnaire(row.posttest_session_id),
    env.DB.prepare(
      `SELECT id, original_name, bytes, status FROM uploads
        WHERE submission_id = ? AND user_id = ? AND kind = 'ai_chat_pdf'
        ORDER BY created_at DESC, rowid DESC LIMIT 1`,
  ).bind(row.id, row.user_id).first<{ bytes: number; id: string; original_name: string; status: string }>(),
    env.DB.prepare(
      "SELECT acknowledged_at FROM submission_consent_acknowledgements WHERE submission_id = ? AND user_id = ? AND consent_version = ?",
  ).bind(row.id, row.user_id, aiChatUploadConsentVersion).first<{ acknowledged_at: string }>(),
  ]);

  return { acknowledgement, answerForm, posttestForm, status: row.status, submissionId: row.id, upload: upload ?? null };
}

async function getDraft(userId: string, subgameId: string) {
  const row = await env.DB.prepare(
    `SELECT id, posttest_session_id, questionnaire_session_id, status, subgame_id, user_id
       FROM submissions
      WHERE user_id = ? AND subgame_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1`,
  ).bind(userId, subgameId).first<SubmissionRow>();

  return row ? loadSubmission(row) : null;
}

export async function GET(request: Request): Promise<Response> {
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;

  const subgameId = new URL(request.url).searchParams.get("subgameId") ?? "";
  if (!/^subgame-node-zone-(quantum|space)$/.test(subgameId)) return response({ code: "INVALID_SUBGAME" }, 400);

  return response({ submission: await getDraft(participant.userId, subgameId) });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return response({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;
  if (!(await isWithinPlayerMutationLimit(participant.userId, "submission-draft", 12))) return response({ code: "REQUEST_RATE_LIMITED" }, 429);

  const body = await readBoundedJson(request, 1_024);
  if (typeof body !== "object" || body === null || typeof (body as { subgameId?: unknown }).subgameId !== "string") {
    return response({ code: "INVALID_SUBMISSION" }, 400);
  }

  const subgameId = (body as { subgameId: string }).subgameId;
  if (!/^subgame-node-zone-(quantum|space)$/.test(subgameId)) return response({ code: "INVALID_SUBGAME" }, 400);

  const existing = await getDraft(participant.userId, subgameId);
  if (existing) return response({ submission: existing, status: "resumed" });

  const subgame = await env.DB.prepare(
    `SELECT subgames.id, subgames.game_id
       FROM subgames INNER JOIN games ON games.id = subgames.game_id
      WHERE subgames.id = ? AND games.status = 'playable' AND subgames.status = 'playable'`,
  ).bind(subgameId).first<{ game_id: string; id: string }>();
  if (!subgame) return response({ code: "PLAYABLE_SUBGAME_NOT_FOUND" }, 404);

  const [answerQuestionnaire, posttestQuestionnaire] = await Promise.all([
    env.DB.prepare("SELECT id FROM questionnaires WHERE questionnaire_key = ? AND published = 1 ORDER BY created_at DESC LIMIT 1")
      .bind(`submission:${subgameId}`).first<{ id: string }>(),
    env.DB.prepare("SELECT id FROM questionnaires WHERE questionnaire_key = ? AND published = 1 ORDER BY created_at DESC LIMIT 1")
      .bind(`postgame:${subgameId}`).first<{ id: string }>(),
  ]);
  if (!answerQuestionnaire || !posttestQuestionnaire) return response({ code: "SUBMISSION_FORM_UNAVAILABLE" }, 503);

  const submissionId = crypto.randomUUID();
  const answerSessionId = crypto.randomUUID();
  const posttestSessionId = crypto.randomUUID();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO questionnaire_sessions (id, user_id, questionnaire_id) VALUES (?, ?, ?), (?, ?, ?)`,
      ).bind(answerSessionId, participant.userId, answerQuestionnaire.id, posttestSessionId, participant.userId, posttestQuestionnaire.id),
      env.DB.prepare(
        `INSERT INTO submissions (id, user_id, subgame_id, questionnaire_session_id, posttest_session_id, status)
         VALUES (?, ?, ?, ?, ?, 'draft')`,
      ).bind(submissionId, participant.userId, subgameId, answerSessionId, posttestSessionId),
      env.DB.prepare(
        `INSERT INTO activity_events (id, event_id, user_id, event_type, game_id, subgame_id, payload_json)
         VALUES (?, ?, ?, 'submission_draft_saved', ?, ?, '{}')`,
      ).bind(crypto.randomUUID(), crypto.randomUUID(), participant.userId, subgame.game_id, subgameId),
    ]);
  } catch {
    const racedDraft = await getDraft(participant.userId, subgameId);
    if (racedDraft) return response({ submission: racedDraft, status: "resumed" });
    throw new Error("Could not create submission draft.");
  }

  const draft = await getDraft(participant.userId, subgameId);
  return response({ submission: draft, status: "created" }, 201);
}
