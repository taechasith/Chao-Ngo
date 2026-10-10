/** Only configured case baselines gate play. Completed baselines keep their original version. */
export async function hasRequiredCasePretest(db: D1Database, userId: string, subgameId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT
    EXISTS(SELECT 1 FROM questionnaires WHERE questionnaire_key=? AND published=1) configured,
    EXISTS(SELECT 1 FROM questionnaire_sessions s JOIN questionnaires q ON q.id=s.questionnaire_id
      WHERE s.user_id=? AND q.questionnaire_key=? AND s.completed_at IS NOT NULL) completed`)
    .bind(`pretest:${subgameId}`, userId, `pretest:${subgameId}`).first<{ configured: number; completed: number }>();
  return !row?.configured || Boolean(row.completed);
}
