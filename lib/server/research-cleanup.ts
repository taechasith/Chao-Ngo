type RetentionBindings = { DB: D1Database; PRIVATE_UPLOADS: R2Bucket };

// A pending marker survives failures between private-object deletion and D1 cleanup.
export async function cleanExpiredResearch({ DB, PRIVATE_UPLOADS }: RetentionBindings) {
  const candidates = await DB.prepare(
    `SELECT id FROM "user"
      WHERE (research_retention_expires_at <= CURRENT_TIMESTAMP OR research_deletion_pending_at IS NOT NULL)
        AND (research_retention_hold_until IS NULL OR research_retention_hold_until <= CURRENT_TIMESTAMP)
      ORDER BY COALESCE(research_deletion_pending_at, research_retention_expires_at) LIMIT 20`,
  ).all<{ id: string }>();
  let completed = 0;
  let failed = 0;
  for (const { id } of candidates.results) {
    try {
      const claim = await DB.prepare(
        `UPDATE "user" SET research_deletion_pending_at = COALESCE(research_deletion_pending_at, CURRENT_TIMESTAMP)
          WHERE id = ? AND (research_retention_expires_at <= CURRENT_TIMESTAMP OR research_deletion_pending_at IS NOT NULL)
            AND (research_retention_hold_until IS NULL OR research_retention_hold_until <= CURRENT_TIMESTAMP)`,
      ).bind(id).run();
      if (!claim.meta.changes) continue;

      const prefix = `research-uploads/${id}/`;
      const objects = await PRIVATE_UPLOADS.list({ prefix, limit: 200 });
      if (objects.objects.length) await PRIVATE_UPLOADS.delete(objects.objects.map((object) => object.key));
      if (objects.truncated) continue;

      await DB.batch([
        DB.prepare("DELETE FROM activity_events WHERE user_id = ?").bind(id),
        DB.prepare("DELETE FROM submissions WHERE user_id = ?").bind(id),
        DB.prepare("DELETE FROM questionnaire_sessions WHERE user_id = ?").bind(id),
        DB.prepare("DELETE FROM achievements WHERE user_id = ?").bind(id),
        DB.prepare("DELETE FROM player_notifications WHERE user_id = ?").bind(id),
        DB.prepare("DELETE FROM admin_notifications WHERE user_id = ?").bind(id),
        DB.prepare("DELETE FROM thank_you_letters WHERE user_id = ?").bind(id),
        DB.prepare("DELETE FROM subgame_progress WHERE user_id = ?").bind(id),
        DB.prepare("DELETE FROM player_sessions WHERE user_id = ?").bind(id),
        DB.prepare("DELETE FROM user_profiles WHERE user_id = ?").bind(id),
        DB.prepare("DELETE FROM consent_records WHERE user_id = ?").bind(id),
        // The account is directly identifying data. Remove it only after private objects
        // and account-linked research records are gone, so a failed run can retry safely.
        DB.prepare(`DELETE FROM "user" WHERE id = ?`).bind(id),
      ]);
      completed += 1;
    } catch {
      failed += 1;
    }
  }
  if (failed) throw new Error(`Research retention cleanup failed for ${failed} participant(s); pending work will retry.`);
  return { completed };
}
