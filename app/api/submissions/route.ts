import { withD1RetryableErrorHandling } from "../../../lib/server/d1-overload";
import { env } from "cloudflare:workers";
import { storedAdditionalAiLinks } from "../../../lib/ai-preparation";

import { requireResearchParticipant } from "../../../lib/server/research-access";
import { readBoundedJson } from "../../../lib/server/questionnaires/request";
import { isSameOriginRequest } from "../../../lib/server/request-security";
import { aiChatUploadConsentVersion } from "../../../lib/server/research-consent-copy";
import { isWithinPlayerMutationLimit } from "../../../lib/server/request-limits";
import {
  submissionRequirementsFromSnapshot,
  isSafeSubmissionSubgameId,
  type RequirementRow,
} from "../../../lib/server/submissions/requirements";

import { casePretestStatusStatement, type CasePretestStatus } from "../../../lib/server/questionnaires/pretest";
import { refreshActiveSession } from "../../../lib/server/questionnaires/live-updates";

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
  additional_ai_links_json: string;
  ai_companion_confirmed_at: string | null;
  id: string;
  posttest_session_id: string | null;
  questionnaire_session_id: string | null;
  status: string;
  reviewer_note: string | null;
  subgame_id: string;
  user_id: string;
};

type UploadSummary = { bytes: number; id: string; original_name: string; status: string };

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store" }, status });
}

type SessionRow = {
  id: string;
  questionnaire_id: string;
  questionnaire_key: string;
  title: string;
  version: string;
  completed_at: string | null;
};
type QuestionRow = { session_id: string; id: string; options_json: string; prompt_th: string; question_key: string; required: number; type: string };
type SavedRow = { session_id: string; question_id: string; value_json: string };

function questionnaireStatements(userId: string, sessionIds: string[]) {
  const parameters = sessionIds.map(() => "?").join(", ");
  const ownedSessions = `s.user_id = ? AND s.id IN (${parameters})`;
  return [
    env.DB.prepare(`SELECT s.id, s.questionnaire_id, s.completed_at, q.questionnaire_key, q.title, q.version
      FROM questionnaire_sessions s JOIN questionnaires q ON q.id = s.questionnaire_id
      WHERE ${ownedSessions}`).bind(userId, ...sessionIds),
    env.DB.prepare(`SELECT s.id session_id, q.id, q.question_key, q.prompt_th, q.type, q.required, q.options_json
      FROM questionnaire_sessions s JOIN questions q ON q.questionnaire_id = s.questionnaire_id
      WHERE ${ownedSessions} ORDER BY q.sort_order`).bind(userId, ...sessionIds),
    env.DB.prepare(`SELECT s.id session_id, r.question_id, r.value_json
      FROM questionnaire_sessions s JOIN responses r ON r.session_id = s.id
      WHERE ${ownedSessions}`).bind(userId, ...sessionIds),
  ] as const;
}

function readForms([sessions, questions, saved]: D1Result[]): Map<string, RouteQuestionnaire> {
  return new Map((sessions.results as SessionRow[]).map(session => {
    const responses = Object.fromEntries((saved.results as SavedRow[])
      .filter(row => row.session_id === session.id).map(row => {
        try { return [row.question_id, JSON.parse(row.value_json) as unknown]; }
        catch { return [row.question_id, null]; }
      }));
    const form = {
      id: session.questionnaire_id,
      key: session.questionnaire_key,
      title: session.title,
      version: session.version,
      sessionId: session.id,
      completed: Boolean(session.completed_at),
      questions: (questions.results as QuestionRow[]).filter(row => row.session_id === session.id).map(row => ({
        id: row.id, key: row.question_key, promptTh: row.prompt_th, type: row.type,
        required: Number(row.required) === 1, options: JSON.parse(row.options_json) as unknown,
      })),
      responses,
    };
    return [session.id, form];
  }));
}

const requirementsStatement = (subgameId: string) =>
  env.DB.prepare("SELECT * FROM subgame_submission_requirements WHERE subgame_id = ? LIMIT 1").bind(subgameId);

async function loadSubmission(row: SubmissionRow) {
  const activeForms = questionnaireStatements(row.user_id, [row.questionnaire_session_id ?? "", row.posttest_session_id ?? ""]);
  const uploadStatements = [
    env.DB.prepare(`SELECT id, original_name, bytes, status FROM uploads
      WHERE submission_id = ? AND user_id = ? AND kind = 'ai_chat_pdf'
      ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(row.id, row.user_id),
    env.DB.prepare(`SELECT id, original_name, bytes, status FROM uploads
      WHERE submission_id = ? AND user_id = ? AND kind = 'answer_attachment' AND status IN ('uploaded','accepted')
      ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(row.id, row.user_id),
    env.DB.prepare(`SELECT acknowledged_at FROM submission_consent_acknowledgements
      WHERE submission_id = ? AND user_id = ? AND consent_version = ?`).bind(row.id, row.user_id, aiChatUploadConsentVersion),
  ];
  const statements = [...activeForms, ...uploadStatements, requirementsStatement(row.subgame_id)];
  const result = await env.DB.batch([
    ...statements,
    env.DB.prepare(`SELECT previous_session_id FROM submission_form_history
      WHERE submission_id = ? ORDER BY created_at, rowid`).bind(row.id),
  ]).catch(error => {
    if (!(error instanceof Error) || !/no such table:.*submission_form_history/.test(error.message)) throw error;
    return env.DB.batch([...statements, env.DB.prepare("SELECT previous_session_id FROM submission_form_migrations WHERE submission_id = ?").bind(row.id)]);
  });
  const forms = readForms(result.slice(0, 3));
  const answerForm = forms.get(row.questionnaire_session_id ?? "") ?? null;
  const posttestForm = forms.get(row.posttest_session_id ?? "") ?? null;
  const aiChatPdf = result[3].results[0] as UploadSummary | undefined;
  const answerAttachment = result[4].results[0] as UploadSummary | undefined;
  const acknowledgement = result[5].results[0] as { acknowledged_at: string } | undefined;
  const requirements = submissionRequirementsFromSnapshot(row.subgame_id, result[6].results[0] as RequirementRow | undefined, answerForm);

  const previousForms: RouteQuestionnaire[] = [];
  const history = result[7].results as Array<{ previous_session_id: string }>;
  if (requirements.requiresAnswerForm && history.length) {
    // Keep batches below the D1 limit on bound parameters, while returning history in chronological order.
    for (let offset = 0; offset < history.length; offset += 75) {
      const ids = history.slice(offset, offset + 75).map(item => item.previous_session_id);
      const previous = readForms(await env.DB.batch([...questionnaireStatements(row.user_id, ids)]));
      for (const id of ids) {
        const form = previous.get(id);
        if (form) previousForms.push(form);
      }
    }
  }
  return {
    preparation: { aiCompanionUsed: Boolean(row.ai_companion_confirmed_at), additionalAiLinks: storedAdditionalAiLinks(row.additional_ai_links_json) },
    previousAnswerForm: previousForms[0] ?? null,
    previousAnswerForms: previousForms,
    acknowledgement: acknowledgement ?? null,
    answerForm,
    posttestForm,
    requirements,
    status: row.status,
    reviewerNote: row.reviewer_note,
    submissionId: row.id,
    // Kept for current API consumers while the client moves to explicit upload kinds.
    upload: aiChatPdf ?? null,
    uploads: {
      aiChatPdf: aiChatPdf ?? null,
      answerAttachment: answerAttachment ?? null,
    },
  };
}

function latestDraftStatement(userId: string, subgameId: string) {
  return env.DB.prepare(`SELECT id, posttest_session_id, questionnaire_session_id, status, reviewer_note,
      subgame_id, user_id, additional_ai_links_json, ai_companion_confirmed_at
    FROM submissions WHERE user_id = ? AND subgame_id = ?
    ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(userId, subgameId);
}

async function getDraft(userId: string, subgameId: string) {
  const row = await latestDraftStatement(userId, subgameId).first<SubmissionRow>();
  return row ? loadSubmission(row) : null;
}

function publishedQuestionnaireStatement(questionnaireKey: string) {
  return env.DB.prepare(`SELECT id FROM questionnaires WHERE questionnaire_key = ? AND published = 1
    ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(questionnaireKey);
}

async function handleGET(request: Request): Promise<Response> {
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;

  const subgameId = new URL(request.url).searchParams.get("subgameId") ?? "";
  if (!isSafeSubmissionSubgameId(subgameId)) return response({ code: "INVALID_SUBGAME" }, 400);

  return response({ submission: await getDraft(participant.userId, subgameId) });
}

async function handlePOST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return response({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;
  if (!(await isWithinPlayerMutationLimit(participant.userId, "submission-draft", 12))) return response({ code: "REQUEST_RATE_LIMITED" }, 429);

  const body = await readBoundedJson(request, 1_024);
  if (typeof body !== "object" || body === null || typeof (body as { subgameId?: unknown }).subgameId !== "string") {
    return response({ code: "INVALID_SUBMISSION" }, 400);
  }

  const subgameId = (body as { subgameId: string }).subgameId;
  if (!isSafeSubmissionSubgameId(subgameId)) return response({ code: "INVALID_SUBGAME" }, 400);

  const userId = participant.userId;
  const [previous, playable, pretest, requirementResult, answerInstrument, posttestInstrument] = await env.DB.batch([
    latestDraftStatement(userId, subgameId),
    env.DB.prepare(`SELECT s.game_id FROM subgames s JOIN games g ON g.id = s.game_id
      WHERE s.id = ? AND s.status = 'playable' AND g.status = 'playable'`).bind(subgameId),
    casePretestStatusStatement(env.DB, userId, subgameId),
    requirementsStatement(subgameId),
    publishedQuestionnaireStatement(`submission:${subgameId}`),
    publishedQuestionnaireStatement(`postgame:${subgameId}`),
  ]);
  const existing = previous.results[0] as SubmissionRow | undefined;
  const casePretest = pretest.results[0] as CasePretestStatus;
  if ((!existing || existing.status === "draft") && casePretest.configured && !casePretest.completed) {
    return response({ code: "CASE_PRETEST_REQUIRED" }, 409);
  }
  const requirements = submissionRequirementsFromSnapshot(subgameId, requirementResult.results[0] as RequirementRow | undefined);
  const posttestId = (posttestInstrument.results[0] as { id: string } | undefined)?.id;
  if (existing) {
    if (existing.status === "draft") {
      for (const sessionId of [existing.questionnaire_session_id, existing.posttest_session_id]) {
        if (sessionId) await refreshActiveSession(env.DB, userId, sessionId);
      }
      // Attach a newly required posttest to older drafts without replacing the answers.
      if (requirements.requiresPosttest && !existing.posttest_session_id) {
        if (!posttestId) return response({ code: "SUBMISSION_FORM_UNAVAILABLE" }, 503);
        const sessionId = crypto.randomUUID();
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO questionnaire_sessions(id,user_id,questionnaire_id)
            SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM submissions WHERE id=? AND user_id=? AND status='draft' AND posttest_session_id IS NULL)`)
            .bind(sessionId, userId, posttestId, existing.id, userId),
          env.DB.prepare(`UPDATE submissions SET posttest_session_id=?,updated_at=CURRENT_TIMESTAMP
            WHERE id=? AND user_id=? AND status='draft' AND posttest_session_id IS NULL`)
            .bind(sessionId, existing.id, userId),
        ]);
      }
      return response({ submission: await getDraft(userId, subgameId), status: "resumed" });
    }
    return response({ submission: await loadSubmission(existing), status: "resumed" });
  }

  const subgame = playable.results[0] as { game_id: string } | undefined;
  if (!subgame) return response({ code: "PLAYABLE_SUBGAME_NOT_FOUND" }, 404);
  const answerQuestionnaireId = requirements.requiresAnswerTextOrAttachment
    ? (answerInstrument.results[0] as { id: string } | undefined)?.id : undefined;
  const posttestQuestionnaireId = requirements.requiresPosttest ? posttestId : undefined;
  if (
    (requirements.requiresAnswerTextOrAttachment && !answerQuestionnaireId) ||
    (requirements.requiresPosttest && !posttestQuestionnaireId)
  ) return response({ code: "SUBMISSION_FORM_UNAVAILABLE" }, 503);

  const submissionId = crypto.randomUUID();
  const answerSessionId = answerQuestionnaireId ? crypto.randomUUID() : null;
  const posttestSessionId = posttestQuestionnaireId ? crypto.randomUUID() : null;
  const statements: D1PreparedStatement[] = [];

  if (answerSessionId && answerQuestionnaireId) {
    statements.push(
      env.DB.prepare("INSERT INTO questionnaire_sessions (id, user_id, questionnaire_id) VALUES (?, ?, ?)")
        .bind(answerSessionId, participant.userId, answerQuestionnaireId),
    );
  }
  if (posttestSessionId && posttestQuestionnaireId) {
    statements.push(
      env.DB.prepare("INSERT INTO questionnaire_sessions (id, user_id, questionnaire_id) VALUES (?, ?, ?)")
        .bind(posttestSessionId, participant.userId, posttestQuestionnaireId),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO submissions (id, user_id, subgame_id, questionnaire_session_id, posttest_session_id, status)
       VALUES (?, ?, ?, ?, ?, 'draft')`,
    ).bind(submissionId, participant.userId, subgameId, answerSessionId, posttestSessionId),
    env.DB.prepare(
      `INSERT INTO activity_events (id, event_id, user_id, event_type, game_id, subgame_id, payload_json)
       VALUES (?, ?, ?, 'submission_draft_saved', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      crypto.randomUUID(),
      participant.userId,
      subgame.game_id,
      subgameId,
      JSON.stringify({ instrumentVersion: requirements.instrumentVersion }),
    ),
  );

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const racedDraft = await getDraft(participant.userId, subgameId);
    if (racedDraft) return response({ submission: racedDraft, status: "resumed" });
    throw error;
  }

  const submission = await loadSubmission({
    id: submissionId, user_id: userId, subgame_id: subgameId, status: "draft",
    questionnaire_session_id: answerSessionId, posttest_session_id: posttestSessionId,
    reviewer_note: null, additional_ai_links_json: "[]", ai_companion_confirmed_at: null,
  });
  return response({ submission, status: "created" }, 201);
}

export const GET = withD1RetryableErrorHandling(handleGET);
export const POST = withD1RetryableErrorHandling(handlePOST);
