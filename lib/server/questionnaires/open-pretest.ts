import { env } from "cloudflare:workers";
import { getAuth, getAuthReadinessForRuntime } from "../auth";
import { researchCollectionPolicy, isResearchCollectionReady } from "../research-policy";
import { readQuestionnaireSession, refreshActiveSession } from "./live-updates";

const published = `SELECT id, questionnaire_key, version, title FROM questionnaires
  WHERE questionnaire_key = ? AND published = 1 ORDER BY created_at DESC, rowid DESC LIMIT 1`;
const eligible = `SELECT 1 FROM "user" u WHERE u.id = ? AND u.emailVerified = 1
  AND u.research_deletion_pending_at IS NULL
  AND (u.research_retention_expires_at IS NULL OR u.research_retention_expires_at > CURRENT_TIMESTAMP)`;
const consent = `SELECT 1 FROM consent_records c WHERE c.user_id = ? AND c.consent_version = ?
  AND c.data_notice_version = ? AND c.research_participation = 1 AND c.withdrawn_at IS NULL`;
const enabled = `EXISTS (SELECT 1 FROM app_metadata WHERE key = 'research_collection_enabled' AND value = 'true')`;
const canOpen = `${enabled} AND EXISTS (${eligible}) AND EXISTS (${consent})`;
const belowLimit = `EXISTS (SELECT 1 FROM player_rate_limits WHERE rate_key = ? AND request_count <= 8)`;
const sessions = `SELECT s.id, s.questionnaire_id, s.completed_at FROM questionnaire_sessions s
  JOIN questionnaires q ON q.id = s.questionnaire_id
  WHERE s.user_id = ? AND q.questionnaire_key = ?
    AND (s.completed_at IS NOT NULL OR s.closed_at IS NULL)`;
const preferredSession = `${sessions}
  ORDER BY (s.completed_at IS NULL),
    CASE WHEN s.completed_at IS NOT NULL THEN s.started_at END,
    CASE WHEN s.completed_at IS NOT NULL THEN s.rowid END,
    s.started_at DESC, s.rowid DESC LIMIT 1`;

type PretestQuestion = { id: string; key: string; optionsJson: string; promptTh: string; required: number; type: string };
type PretestRow = { latest_id: string; id: string; key: string; title: string; version: string; session_id: string; completed_at: string | null;
  has_history: number; question_rows: string; response_rows: string };
const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function pretestHistory(db: D1Database, userId: string, sessionId: string) {
  const chain = await db.prepare(`WITH RECURSIVE chain(id, depth) AS (
    SELECT previous_session_id, 0 FROM questionnaire_session_updates WHERE current_session_id = ?
    UNION ALL SELECT u.previous_session_id, chain.depth + 1 FROM questionnaire_session_updates u
      JOIN chain ON u.current_session_id = chain.id WHERE chain.depth < 50
  ) SELECT id FROM chain ORDER BY depth DESC`).bind(sessionId).all<{ id: string }>();
  return (await Promise.all(chain.results.map(row => readQuestionnaireSession(db, userId, row.id)))).filter(Boolean);
}

/** Fast path for the burst when many participants open a case for the first time. */
export async function openCasePretest(request: Request, key: string): Promise<Response> {
  if (!/^pretest:subgame-[a-z0-9-]{1,47}$/.test(key)) return json({ code: "QUESTIONNAIRE_NOT_FOUND" }, 404);
  if (!isResearchCollectionReady({ ...researchCollectionPolicy, enabled: true, privateStorageReady: Boolean(env.PRIVATE_UPLOADS) })) {
    return json({ code: "RESEARCH_CONSENT_UNAVAILABLE" }, 503);
  }
  if (!getAuthReadinessForRuntime().isReady) return json({ code: "AUTH_NOT_CONFIGURED" }, 503);
  // Better Auth still verifies the signed cookie and the live session. Opening this form need not renew it.
  const session = await getAuth().api.getSession({ headers: request.headers, query: { disableRefresh: true } });
  if (!session) return json({ code: "UNAUTHENTICATED" }, 401);
  const userId = session.user.id;
  const { consentVersion, dataNoticeVersion } = researchCollectionPolicy;
  const auth = [userId, userId, consentVersion, dataNoticeVersion] as const;
  const rateKey = `questionnaire-session:${userId}`;
  const id = crypto.randomUUID();
  const db = env.DB;
  // Eligibility, the rate counter, the session/event and the returned snapshot share one D1 transaction.
  const [gate, rate, created, , snapshot] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT ${enabled} enabled, EXISTS (${eligible}) eligible, EXISTS (${consent}) consent_active`).bind(...auth),
    db.prepare(`INSERT INTO player_rate_limits (rate_key, request_count, window_started_at, updated_at)
      SELECT ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP WHERE ${canOpen}
      ON CONFLICT(rate_key) DO UPDATE SET
        request_count = CASE WHEN window_started_at <= datetime('now', '-60 seconds') THEN 1 ELSE request_count + 1 END,
        window_started_at = CASE WHEN window_started_at <= datetime('now', '-60 seconds') THEN CURRENT_TIMESTAMP ELSE window_started_at END,
        updated_at = CURRENT_TIMESTAMP RETURNING request_count`).bind(rateKey, ...auth),
    db.prepare(`WITH active_questionnaire AS (${published})
      INSERT INTO questionnaire_sessions (id, user_id, questionnaire_id)
      SELECT ?, ?, q.id FROM active_questionnaire q
      WHERE ${canOpen} AND ${belowLimit} AND NOT EXISTS (${sessions})
      ON CONFLICT DO NOTHING`).bind(key, id, userId, ...auth, rateKey, userId, key),
    db.prepare(`INSERT INTO activity_events (id, event_id, user_id, event_type, payload_json)
      SELECT ?, ?, s.user_id, 'pregame_started', json_object('questionnaireKey', q.questionnaire_key, 'version', q.version)
      FROM questionnaire_sessions s JOIN questionnaires q ON q.id = s.questionnaire_id WHERE s.id = ? AND s.user_id = ?`)
      .bind(crypto.randomUUID(), crypto.randomUUID(), id, userId),
    db.prepare(`WITH active_questionnaire AS (${published}), picked AS (${preferredSession})
      SELECT aq.id latest_id, q.id id, q.questionnaire_key key, q.title, q.version, p.id session_id, p.completed_at,
        EXISTS (SELECT 1 FROM questionnaire_session_updates WHERE current_session_id = p.id) has_history,
        (SELECT json_group_array(json_object('id', id, 'key', question_key, 'optionsJson', options_json, 'promptTh', prompt_th,
             'required', required, 'type', type))
          FROM (SELECT id, question_key, options_json, prompt_th, required, type FROM questions
             WHERE questionnaire_id = q.id ORDER BY sort_order)) question_rows,
        (SELECT json_group_array(json_object('id', question_id, 'value', value_json)) FROM responses WHERE session_id = p.id) response_rows
      FROM active_questionnaire aq CROSS JOIN picked p JOIN questionnaires q ON q.id = p.questionnaire_id
      WHERE ${canOpen} AND ${belowLimit}`).bind(key, userId, key, ...auth, rateKey),
  ]);
  const access = gate.results[0];
  if (!access?.enabled) return json({ code: "RESEARCH_CONSENT_UNAVAILABLE" }, 503);
  if (!access.eligible) return json({ code: "RESEARCH_DATA_EXPIRED" }, 403);
  if (!access.consent_active) return json({ code: "RESEARCH_CONSENT_REQUIRED" }, 403);
  if (Number(rate.results[0]?.request_count ?? 9) > 8) return json({ code: "REQUEST_RATE_LIMITED" }, 429);
  const row = snapshot.results[0] as PretestRow | undefined;
  if (!row) return json({ code: "QUESTIONNAIRE_NOT_FOUND" }, 404);
  if (!row.completed_at && row.id !== row.latest_id) {
    const refresh = await refreshActiveSession(db, userId, row.session_id);
    const form = await readQuestionnaireSession(db, userId, refresh.sessionId);
    if (!form) return json({ code: "QUESTIONNAIRE_NOT_FOUND" }, 404);
    return json({ questionnaire: { id: form.id, key: form.key, title: form.title, version: form.version, questions: form.questions },
      sessionId: form.sessionId, completed: form.completed, responses: form.responses, previousForms: await pretestHistory(db, userId, form.sessionId) });
  }
  const questions = (JSON.parse(row.question_rows) as PretestQuestion[]).map(({ optionsJson, required, ...question }) =>
    ({ ...question, options: JSON.parse(optionsJson) as unknown, required: required === 1 }));
  const responses = Object.create(null) as Record<string, unknown>;
  for (const item of JSON.parse(row.response_rows) as Array<{ id: string; value: string }>) {
    try { responses[item.id] = JSON.parse(item.value) as unknown; } catch { /* Ignore malformed historical values. */ }
  }
  return json({ questionnaire: { id: row.id, key: row.key, title: row.title, version: row.version, questions },
    sessionId: row.session_id, completed: Boolean(row.completed_at), responses,
    previousForms: !row.completed_at && row.has_history ? await pretestHistory(db, userId, row.session_id) : [],
  }, created.meta.changes ? 201 : 200);
}
