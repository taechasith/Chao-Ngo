import { env } from "cloudflare:workers";

import { getSubmissionRequirementsForSubgames } from "./submissions/requirements";

const autoPassConfigKey = "completion_auto_pass_submissions";

export type CompletionState = {
  allRequiredSubgamesCompleted: boolean;
  completedSubgameIds: string[];
  letterEligible: boolean;
  requiredSubgameIds: string[];
};

type PlayableSubgame = { id: string; required_for_completion: number; title: string };
type SubmittedSubgame = {
  legacy_ka_no_posttest: number;
  answer_attachment_uploaded: number;
  answer_completed_at: string | null;
  posttest_completed_at: string | null;
  subgame_id: string;
};

function insertAchievement(userId: string, key: string, scope: string, subgameId?: string) {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO achievements (id, user_id, achievement_key, subgame_id, scope_key, metadata_json)
     VALUES (?, ?, ?, ?, ?, '{}')`,
  ).bind(crypto.randomUUID(), userId, key, subgameId ?? null, scope);
}

function insertPlayerNotification(userId: string, key: string, kind: string, body: string) {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO player_notifications (id, user_id, notification_key, kind, body_th)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), userId, key, kind, body);
}

function insertAdminNotification(userId: string, key: string, type: string, resourceType: string, resourceId: string) {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO admin_notifications (
       id, notification_key, user_id, type, resource_type, resource_id, payload_json
     ) VALUES (?, ?, ?, ?, ?, ?, '{}')`,
  ).bind(crypto.randomUUID(), key, userId, type, resourceType, resourceId);
}

export async function recalculateCompletionForUser(userId: string): Promise<CompletionState> {
  const [playableRows, userRows, submittedRows] = await env.DB.batch([
    env.DB.prepare(
      `SELECT subgames.id, subgames.required_for_completion, subgames.title
         FROM subgames INNER JOIN games ON games.id = subgames.game_id
        WHERE games.status = 'playable' AND subgames.status = 'playable'`,
    ),
    env.DB.prepare(
      `SELECT emailVerified AS email_verified,
              EXISTS (SELECT 1 FROM consent_records WHERE user_id = u.id
                AND research_participation = 1 AND withdrawn_at IS NULL) AS consent_active,
              EXISTS (SELECT 1 FROM submissions s
                INNER JOIN subgames sg ON sg.id = s.subgame_id
                INNER JOIN games g ON g.id = sg.game_id
                WHERE s.user_id = u.id AND s.status = 'needs_revision'
                  AND sg.required_for_completion = 1 AND sg.status = 'playable' AND g.status = 'playable'
                  AND s.id = (SELECT latest.id FROM submissions latest
                    WHERE latest.user_id = s.user_id AND latest.subgame_id = s.subgame_id
                    ORDER BY latest.created_at DESC, latest.rowid DESC LIMIT 1)) AS needs_revision
         FROM "user" u WHERE u.id = ?`,
    ).bind(userId),
    env.DB.prepare(
      `SELECT submissions.subgame_id,
              (submissions.subgame_id IN ('subgame-ka-fintech','subgame-ka-wa-ve')
                AND submissions.posttest_session_id IS NULL
                AND EXISTS(SELECT 1 FROM questions WHERE questionnaire_id=answer_session.questionnaire_id
                  AND question_key IN ('case_summary','case_truth_model'))) AS legacy_ka_no_posttest,
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
          AND submissions.id = (SELECT latest.id FROM submissions latest
            WHERE latest.user_id = submissions.user_id AND latest.subgame_id = submissions.subgame_id
            ORDER BY latest.created_at DESC, latest.rowid DESC LIMIT 1)
          AND submissions.status IN ('submitted', 'accepted')
          AND (submissions.status = 'accepted' OR (SELECT value FROM app_metadata WHERE key = ?) = 'true')`,
    ).bind(userId, autoPassConfigKey),
  ]);
  const user = userRows.results[0] as { email_verified: number; consent_active: number; needs_revision: number } | undefined;
  const playableSubgames = playableRows.results as PlayableSubgame[];
  const requiredSubgames = playableSubgames.filter((subgame) => subgame.required_for_completion === 1);
  const submitted = submittedRows.results as SubmittedSubgame[];
  const requirementsBySubgame = await getSubmissionRequirementsForSubgames(env.DB, submitted.map(row => row.subgame_id));
  const qualifyingIds = new Set(submitted.map((submission) => {
    const requirements = requirementsBySubgame.get(submission.subgame_id)!;
    if (
      requirements.requiresAnswerTextOrAttachment &&
      !submission.answer_completed_at &&
      !submission.answer_attachment_uploaded
    ) return null;
    if (requirements.requiresPosttest && !submission.legacy_ka_no_posttest && !submission.posttest_completed_at) return null;
    return submission.subgame_id;
  }).filter((subgameId): subgameId is string => subgameId !== null));
  const activeConsent = Boolean(user?.consent_active);
  const needsRevision = Boolean(user?.needs_revision);
  const writes: D1PreparedStatement[] = [];
  for (const subgame of playableSubgames) {
    if (!qualifyingIds.has(subgame.id)) {
      // A newer draft or requested revision supersedes the previous completion.
      writes.push(env.DB.prepare(`UPDATE subgame_progress SET status = 'in_progress', completed_at = NULL
        WHERE user_id = ? AND subgame_id = ? AND status = 'completed'
          AND EXISTS (SELECT 1 FROM submissions WHERE user_id = ? AND subgame_id = ?)`)
        .bind(userId, subgame.id, userId, subgame.id));
      continue;
    }
    writes.push(env.DB.prepare(
      `INSERT INTO subgame_progress (user_id, subgame_id, status, started_at, last_activity_at, completed_at)
       VALUES (?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, subgame_id) DO UPDATE SET
         status = 'completed', last_activity_at = CURRENT_TIMESTAMP,
         completed_at = COALESCE(subgame_progress.completed_at, CURRENT_TIMESTAMP)`,
    ).bind(userId, subgame.id));
    writes.push(insertAchievement(userId, "subgame_completed", subgame.id, subgame.id));
    writes.push(insertPlayerNotification(userId, `subgame-completed:${userId}:${subgame.id}`, "subgame_completed", `บันทึกว่าคุณสืบคดี ${subgame.title} เสร็จแล้ว`));
  }

  const allRequiredSubgamesCompleted = requiredSubgames.length > 0 && requiredSubgames.every((subgame) => qualifyingIds.has(subgame.id));
  const letterEligible = Boolean(allRequiredSubgamesCompleted && user?.email_verified && activeConsent && !needsRevision);

  if (allRequiredSubgamesCompleted) {
    writes.push(insertAchievement(userId, "all_required_subgames_completed", "all-required-subgames"));
    writes.push(insertPlayerNotification(userId, `all-cases-completed:${userId}`, "all_cases_completed", "คุณสืบครบทุกคดีที่ระบบกำหนดไว้แล้ว"));
  }

  const snapshot = JSON.stringify({
    allRequiredSubgamesCompleted,
    consentActive: Boolean(activeConsent),
    emailVerified: Boolean(user?.email_verified),
    hasNeedsRevision: Boolean(needsRevision),
    requiredSubgameIds: requiredSubgames.map((subgame) => subgame.id),
  });
  if (letterEligible) {
    writes.push(env.DB.prepare(
      `INSERT INTO thank_you_letters (id, user_id, status, eligibility_snapshot_json, eligible_at)
       VALUES (?, ?, 'eligible', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         status = CASE WHEN thank_you_letters.status = 'emailed' THEN 'emailed' ELSE 'eligible' END,
         eligibility_snapshot_json = excluded.eligibility_snapshot_json,
         eligible_at = COALESCE(thank_you_letters.eligible_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), userId, snapshot));
    writes.push(insertAchievement(userId, "thank_you_letter_eligible", "thank-you-letter"));
    writes.push(insertPlayerNotification(userId, `letter-eligible:${userId}`, "letter_eligible", "คุณมีคุณสมบัติตามเกณฑ์รับจดหมายขอบคุณแล้ว"));
    writes.push(insertAdminNotification(userId, `letter-eligible:${userId}`, "letter_eligible", "thank_you_letter", userId));
  } else {
    writes.push(env.DB.prepare(
      `INSERT INTO thank_you_letters (id, user_id, status, eligibility_snapshot_json)
       VALUES (?, ?, 'pending', ?)
       ON CONFLICT(user_id) DO UPDATE SET
         status = CASE WHEN thank_you_letters.status = 'emailed' THEN 'emailed' ELSE 'pending' END,
         eligibility_snapshot_json = excluded.eligibility_snapshot_json,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), userId, snapshot));
  }

  await env.DB.batch(writes);

  return {
    allRequiredSubgamesCompleted,
    completedSubgameIds: playableSubgames.filter((subgame) => qualifyingIds.has(subgame.id)).map((subgame) => subgame.id),
    letterEligible,
    requiredSubgameIds: requiredSubgames.map((subgame) => subgame.id),
  };
}
