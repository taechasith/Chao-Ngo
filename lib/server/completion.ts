import { env } from "cloudflare:workers";

import { consentVersion, dataNoticeVersion } from "./research-consent-copy";
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

export type CompletionLease = { revision: string; token: string };

export async function recalculateCompletionForUser(userId: string, lease?: CompletionLease): Promise<CompletionState> {
  // Recheck eligibility and the claimed revision in the same transaction as every projection write.
  const guard = lease ? `EXISTS (SELECT 1 FROM completion_jobs j JOIN "user" u ON u.id = j.user_id
    WHERE j.user_id = ? AND j.revision = ? AND j.lease_token = ? AND j.lease_until > unixepoch()
      AND u.emailVerified = 1 AND u.research_deletion_pending_at IS NULL
      AND (u.research_retention_expires_at IS NULL OR u.research_retention_expires_at > CURRENT_TIMESTAMP)
      AND EXISTS (SELECT 1 FROM consent_records c WHERE c.user_id = u.id AND c.research_participation = 1
        AND c.consent_version = ? AND c.data_notice_version = ? AND c.withdrawn_at IS NULL))` : "1";
  const guardArgs = lease ? [userId, lease.revision, lease.token, consentVersion, dataNoticeVersion] : [];
  const guardedWrite = (sql: string, ...params: (string | null)[]) =>
    env.DB.prepare(sql.replace("/* eligibility */", guard)).bind(...params, ...guardArgs);
  const insertAchievement = (key: string, scope: string, subgameId?: string) => guardedWrite(
    `INSERT OR IGNORE INTO achievements (id, user_id, achievement_key, subgame_id, scope_key, metadata_json)
     SELECT ?, ?, ?, ?, ?, '{}' WHERE /* eligibility */`,
    crypto.randomUUID(), userId, key, subgameId ?? null, scope,
  );
  const insertPlayerNotification = (key: string, kind: string, body: string) => guardedWrite(
    `INSERT OR IGNORE INTO player_notifications (id, user_id, notification_key, kind, body_th)
     SELECT ?, ?, ?, ?, ? WHERE /* eligibility */`,
    crypto.randomUUID(), userId, key, kind, body,
  );
  const insertAdminNotification = (key: string, type: string, resourceType: string, resourceId: string) => guardedWrite(
    `INSERT OR IGNORE INTO admin_notifications
       (id, notification_key, user_id, type, resource_type, resource_id, payload_json)
     SELECT ?, ?, ?, ?, ?, ?, '{}' WHERE /* eligibility */`,
    crypto.randomUUID(), key, userId, type, resourceType, resourceId,
  );
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
      writes.push(guardedWrite(`UPDATE subgame_progress SET status = 'in_progress', completed_at = NULL
        WHERE user_id = ? AND subgame_id = ? AND status = 'completed'
          AND EXISTS (SELECT 1 FROM submissions WHERE user_id = ? AND subgame_id = ?)
          AND /* eligibility */`, userId, subgame.id, userId, subgame.id));
      continue;
    }
    writes.push(guardedWrite(
      `INSERT INTO subgame_progress (user_id, subgame_id, status, started_at, last_activity_at, completed_at)
       SELECT ?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP WHERE /* eligibility */
       ON CONFLICT(user_id, subgame_id) DO UPDATE SET
         status = 'completed', last_activity_at = CURRENT_TIMESTAMP,
         completed_at = COALESCE(subgame_progress.completed_at, CURRENT_TIMESTAMP)`, userId, subgame.id));
    writes.push(insertAchievement("subgame_completed", subgame.id, subgame.id));
    writes.push(insertPlayerNotification(`subgame-completed:${userId}:${subgame.id}`, "subgame_completed", `บันทึกว่าคุณสืบคดี ${subgame.title} เสร็จแล้ว`));
  }

  const allRequiredSubgamesCompleted = requiredSubgames.length > 0 && requiredSubgames.every((subgame) => qualifyingIds.has(subgame.id));
  const letterEligible = Boolean(allRequiredSubgamesCompleted && user?.email_verified && activeConsent && !needsRevision);

  if (allRequiredSubgamesCompleted) {
    writes.push(insertAchievement("all_required_subgames_completed", "all-required-subgames"));
    writes.push(insertPlayerNotification(`all-cases-completed:${userId}`, "all_cases_completed", "คุณสืบครบทุกคดีที่ระบบกำหนดไว้แล้ว"));
  }

  const snapshot = JSON.stringify({
    allRequiredSubgamesCompleted,
    consentActive: Boolean(activeConsent),
    emailVerified: Boolean(user?.email_verified),
    hasNeedsRevision: Boolean(needsRevision),
    requiredSubgameIds: requiredSubgames.map((subgame) => subgame.id),
  });
  if (letterEligible) {
    writes.push(guardedWrite(
      `INSERT INTO thank_you_letters (id, user_id, status, eligibility_snapshot_json, eligible_at)
       SELECT ?, ?, 'eligible', ?, CURRENT_TIMESTAMP WHERE /* eligibility */
       ON CONFLICT(user_id) DO UPDATE SET
         status = CASE WHEN thank_you_letters.status = 'emailed' THEN 'emailed' ELSE 'eligible' END,
         eligibility_snapshot_json = excluded.eligibility_snapshot_json,
         eligible_at = COALESCE(thank_you_letters.eligible_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP`, crypto.randomUUID(), userId, snapshot));
    writes.push(insertAchievement("thank_you_letter_eligible", "thank-you-letter"));
    writes.push(insertPlayerNotification(`letter-eligible:${userId}`, "letter_eligible", "คุณมีคุณสมบัติตามเกณฑ์รับจดหมายขอบคุณแล้ว"));
    writes.push(insertAdminNotification(`letter-eligible:${userId}`, "letter_eligible", "thank_you_letter", userId));
  } else {
    writes.push(guardedWrite(
      `INSERT INTO thank_you_letters (id, user_id, status, eligibility_snapshot_json)
       SELECT ?, ?, 'pending', ? WHERE /* eligibility */
       ON CONFLICT(user_id) DO UPDATE SET
         status = CASE WHEN thank_you_letters.status = 'emailed' THEN 'emailed' ELSE 'pending' END,
         eligibility_snapshot_json = excluded.eligibility_snapshot_json,
         updated_at = CURRENT_TIMESTAMP`, crypto.randomUUID(), userId, snapshot));
  }

  await env.DB.batch(writes);

  return {
    allRequiredSubgamesCompleted,
    completedSubgameIds: playableSubgames.filter((subgame) => qualifyingIds.has(subgame.id)).map((subgame) => subgame.id),
    letterEligible,
    requiredSubgameIds: requiredSubgames.map((subgame) => subgame.id),
  };
}
