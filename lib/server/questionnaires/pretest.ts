export type CasePretestStatus = { configured: number; completed: number };

export function casePretestStatusStatement(db: D1Database, userId: string, subgameId: string) {
  return db.prepare(`SELECT
    EXISTS(SELECT 1 FROM questionnaires WHERE questionnaire_key=? AND published=1) configured,
    EXISTS(SELECT 1 FROM questionnaire_sessions s JOIN questionnaires q ON q.id=s.questionnaire_id
      WHERE s.user_id=? AND q.questionnaire_key=? AND s.completed_at IS NOT NULL) completed`)
    .bind(`pretest:${subgameId}`, userId, `pretest:${subgameId}`);
}

/** Only configured case baselines gate play. Completed baselines keep their original version. */
export async function hasRequiredCasePretest(db: D1Database, userId: string, subgameId: string): Promise<boolean> {
  const row = await casePretestStatusStatement(db, userId, subgameId).first<CasePretestStatus>();
  return !row?.configured || Boolean(row.completed);
}
