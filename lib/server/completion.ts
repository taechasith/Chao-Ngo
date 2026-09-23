import { env } from "cloudflare:workers";

import { getSubmissionRequirements } from "./submissions/requirements";

const autoPassConfigKey = "completion_auto_pass_submissions";

export type CompletionState = {
  allRequiredSubgamesCompleted: boolean;
  completedSubgameIds: string[];
  letterEligible: boolean;
  requiredSubgameIds: string[];
};

type PlayableSubgame = { id: string; required_for_completion: number; title: string };
type SubmittedSubgame = {
  answer_attachment_uploaded: number;
  answer_completed_at: string | null;
  posttest_completed_at: string | null;
  subgame_id: string;
};

async function insertAchievement(userId: string, key: string, scope: string, subgameId?: string) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO achievements (id, user_id, achievement_key, subgame_id, scope_key, metadata_json)
     VALUES (?, ?, ?, ?, ?, '{}')`,
  ).bind(crypto.randomUUID(), userId, key, subgameId ?? null, scope).run();
}

async function insertPlayerNotification(userId: string, key: string, kind: string, body: string) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO player_notifications (id, user_id, notification_key, kind, body_th)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), userId, key, kind, body).run();
}

async function insertAdminNotification(userId: string, key: string, type: string, resourceType: string, resourceId: string) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO admin_notifications (
       id, notification_key, user_id, type, resource_type, resource_id, payload_json
     ) VALUES (?, ?, ?, ?, ?, ?, '{}')`,
  ).bind(crypto.randomUUID(), key, userId, type, resourceType, resourceId).run();
}

export async function recalculateCompletionForUser(userId: string): Promise<CompletionState> {
  const [config, playable, user] = await Promise.all([
    env.DB.prepare("SELECT value FROM app_metadata WHERE key = ?").bind(autoPassConfigKey).first<{ value: string }>(),
    env.DB.prepare(
      `SELECT subgames.id, subgames.required_for_completion, subgames.title
         FROM subgames INNER JOIN games ON games.id = subgames.game_id
        WHERE games.status = 'playable' AND subgames.status = 'playable'`,
    ).all<PlayableSubgame>(),
    env.DB.prepare(
      `SELECT emailVerified AS email_verified FROM "user" WHERE id = ?`,
    ).bind(userId).first<{ email_verified: number }>(),
  ]);
  const autoPass = config?.value === "true";
  const playableSubgames = playable.results;
  const requiredSubgames = playableSubgames.filter((subgame) => subgame.required_for_completion === 1);
  const submitted = await env.DB.prepare(
    `SELECT submissions.subgame_id,
            answer_session.completed_at AS answer_completed_at,
            posttest_session.completed_at AS posttest_completed_at,
            EXISTS(
              SELECT 1 FROM uploads
               WHERE uploads.submission_id = submissions.id
                 AND uploads.user_id = submissions.user_id
                 AND uploads.kind = 'answer_attachment'
                 AND uploads.status IN ('uploaded', 'accepted')
            ) AS answer_attachment_uploaded
       FROM submissions
       LEFT JOIN questionnaire_sessions AS answer_session ON answer_session.id = submissions.questionnaire_session_id
       LEFT JOIN questionnaire_sessions AS posttest_session ON posttest_session.id = submissions.posttest_session_id
       INNER JOIN subgames ON subgames.id = submissions.subgame_id
       INNER JOIN games ON games.id = subgames.game_id
      WHERE submissions.user_id = ?
        AND games.status = 'playable'
        AND subgames.status = 'playable'
        AND submissions.status IN ('submitted', 'accepted')
        AND (submissions.status = 'accepted' OR ? = 1)`,
  ).bind(userId, Number(autoPass)).all<SubmittedSubgame>();
  const qualifyingIds = new Set((await Promise.all(submitted.results.map(async (submission) => {
    const requirements = await getSubmissionRequirements(env.DB, submission.subgame_id);
    if (
      requirements.requiresAnswerTextOrAttachment &&
      !submission.answer_completed_at &&
      !submission.answer_attachment_uploaded
    ) return null;
    if (requirements.requiresPosttest && !submission.posttest_completed_at) return null;
    return submission.subgame_id;
  }))).filter((subgameId): subgameId is string => subgameId !== null));
  for (const subgame of playableSubgames) {
    if (!qualifyingIds.has(subgame.id)) continue;
    await env.DB.prepare(
      `INSERT INTO subgame_progress (user_id, subgame_id, status, started_at, last_activity_at, completed_at)
       VALUES (?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, subgame_id) DO UPDATE SET
         status = 'completed', last_activity_at = CURRENT_TIMESTAMP,
         completed_at = COALESCE(subgame_progress.completed_at, CURRENT_TIMESTAMP)`,
    ).bind(userId, subgame.id).run();
    await insertAchievement(userId, "subgame_completed", subgame.id, subgame.id);
    await insertPlayerNotification(userId, `subgame-completed:${userId}:${subgame.id}`, "subgame_completed", `บันทึกว่าคุณสืบคดี ${subgame.title} เสร็จแล้ว`);
  }

  const allRequiredSubgamesCompleted = requiredSubgames.length > 0 && requiredSubgames.every((subgame) => qualifyingIds.has(subgame.id));
  const activeConsent = await env.DB.prepare(
    `SELECT id FROM consent_records
      WHERE user_id = ? AND research_participation = 1 AND withdrawn_at IS NULL LIMIT 1`,
  ).bind(userId).first();
  const needsRevision = await env.DB.prepare(
    `SELECT id FROM submissions WHERE user_id = ? AND status = 'needs_revision'
      AND subgame_id IN (${requiredSubgames.map(() => "?").join(",") || "NULL"}) LIMIT 1`,
  ).bind(userId, ...requiredSubgames.map((subgame) => subgame.id)).first();
  const letterEligible = Boolean(allRequiredSubgamesCompleted && user?.email_verified && activeConsent && !needsRevision);

  if (allRequiredSubgamesCompleted) {
    await insertAchievement(userId, "all_required_subgames_completed", "all-required-subgames");
    await insertPlayerNotification(userId, `all-cases-completed:${userId}`, "all_cases_completed", "คุณสืบครบทุกคดีที่ระบบกำหนดไว้แล้ว");
  }

  const snapshot = JSON.stringify({
    allRequiredSubgamesCompleted,
    consentActive: Boolean(activeConsent),
    emailVerified: Boolean(user?.email_verified),
    hasNeedsRevision: Boolean(needsRevision),
    requiredSubgameIds: requiredSubgames.map((subgame) => subgame.id),
  });
  if (letterEligible) {
    await env.DB.prepare(
      `INSERT INTO thank_you_letters (id, user_id, status, eligibility_snapshot_json, eligible_at)
       VALUES (?, ?, 'eligible', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         status = CASE WHEN thank_you_letters.status = 'emailed' THEN 'emailed' ELSE 'eligible' END,
         eligibility_snapshot_json = excluded.eligibility_snapshot_json,
         eligible_at = COALESCE(thank_you_letters.eligible_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), userId, snapshot).run();
    await insertAchievement(userId, "thank_you_letter_eligible", "thank-you-letter");
    await insertPlayerNotification(userId, `letter-eligible:${userId}`, "letter_eligible", "คุณมีคุณสมบัติตามเกณฑ์รับจดหมายขอบคุณแล้ว");
    await insertAdminNotification(userId, `letter-eligible:${userId}`, "letter_eligible", "thank_you_letter", userId);
  } else {
    await env.DB.prepare(
      `INSERT INTO thank_you_letters (id, user_id, status, eligibility_snapshot_json)
       VALUES (?, ?, 'pending', ?)
       ON CONFLICT(user_id) DO UPDATE SET
         status = CASE WHEN thank_you_letters.status = 'emailed' THEN 'emailed' ELSE 'pending' END,
         eligibility_snapshot_json = excluded.eligibility_snapshot_json,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), userId, snapshot).run();
  }

  return {
    allRequiredSubgamesCompleted,
    completedSubgameIds: playableSubgames.filter((subgame) => qualifyingIds.has(subgame.id)).map((subgame) => subgame.id),
    letterEligible,
    requiredSubgameIds: requiredSubgames.map((subgame) => subgame.id),
  };
}
