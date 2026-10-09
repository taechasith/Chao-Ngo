type Session = { id: string; questionnaire_id: string; questionnaire_key: string; completed_at: string | null; closed_at: string | null; latest_id: string | null; draft_id: string | null; locked: number };

export async function currentSessionId(db: D1Database, userId: string, sessionId: string): Promise<string> {
  const result = await db.prepare(`WITH RECURSIVE chain(id, depth) AS (
    SELECT id, 0 FROM questionnaire_sessions WHERE id=? AND user_id=?
    UNION ALL SELECT u.current_session_id, chain.depth+1 FROM questionnaire_session_updates u JOIN chain ON u.previous_session_id=chain.id WHERE chain.depth<50
  ) SELECT id FROM chain ORDER BY depth DESC LIMIT 1`).bind(sessionId,userId).first<{id:string}>();
  return result?.id ?? sessionId;
}

export async function refreshActiveSession(db: D1Database, userId: string, initialId: string): Promise<{sessionId:string;updated:boolean}> {
  const id = await currentSessionId(db,userId,initialId);
  const source = await db.prepare(`SELECT s.id,s.questionnaire_id,s.completed_at,s.closed_at,q.questionnaire_key,
    (SELECT n.id FROM questionnaires n WHERE n.questionnaire_key=q.questionnaire_key AND n.published=1 ORDER BY n.created_at DESC,n.rowid DESC LIMIT 1) latest_id,
    (SELECT sub.id FROM submissions sub WHERE sub.user_id=s.user_id AND sub.status='draft' AND (sub.questionnaire_session_id=s.id OR sub.posttest_session_id=s.id) LIMIT 1) draft_id,
    EXISTS(SELECT 1 FROM submissions sub WHERE sub.status<>'draft' AND (sub.questionnaire_session_id=s.id OR sub.posttest_session_id=s.id)) locked
    FROM questionnaire_sessions s JOIN questionnaires q ON q.id=s.questionnaire_id WHERE s.id=? AND s.user_id=?`).bind(id,userId).first<Session>();
  if (!source || source.closed_at || source.locked || (source.completed_at && !source.draft_id) || !source.latest_id || source.latest_id===source.questionnaire_id) return {sessionId:id,updated:id!==initialId};
  const next = crypto.randomUUID();
  // The batch copies current values in SQL, so a save finishing just before rotation is retained.
  // Every write is conditional on the old session still being editable at transaction time.
  await db.batch([
    db.prepare(`INSERT INTO questionnaire_sessions(id,user_id,questionnaire_id)
      SELECT ?,s.user_id,? FROM questionnaire_sessions s WHERE s.id=? AND s.user_id=? AND s.closed_at IS NULL
      AND (s.completed_at IS NULL OR EXISTS(SELECT 1 FROM submissions sub WHERE sub.status='draft' AND (sub.questionnaire_session_id=s.id OR sub.posttest_session_id=s.id)))
      AND NOT EXISTS(SELECT 1 FROM submissions sub WHERE sub.status<>'draft' AND (sub.questionnaire_session_id=s.id OR sub.posttest_session_id=s.id))`).bind(next,source.latest_id,id,userId),
    db.prepare("UPDATE questionnaire_sessions SET closed_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM questionnaire_sessions WHERE id=?)").bind(id,next),
    db.prepare(`INSERT INTO responses(id,session_id,question_id,value_json,saved_at)
      SELECT ?||r.id,?,n.id,r.value_json,r.saved_at FROM responses r JOIN questions o ON o.id=r.question_id
      JOIN questions n ON n.questionnaire_id=? AND n.question_key=o.question_key AND n.type=o.type AND json(n.options_json)=json(o.options_json)
      WHERE r.session_id=? AND EXISTS(SELECT 1 FROM questionnaire_sessions WHERE id=?)`).bind(next,next,source.latest_id,id,next),
    db.prepare(`INSERT INTO questionnaire_session_updates(previous_session_id,current_session_id)
      SELECT ?,? WHERE EXISTS(SELECT 1 FROM questionnaire_sessions WHERE id=?)`).bind(id,next,next),
    db.prepare(`INSERT INTO submission_form_history(submission_id,previous_session_id,current_session_id)
      SELECT sub.id,?,? FROM submissions sub WHERE sub.questionnaire_session_id=? AND sub.status='draft' AND EXISTS(SELECT 1 FROM questionnaire_sessions WHERE id=?)`).bind(id,next,id,next),
    db.prepare("UPDATE submissions SET questionnaire_session_id=? WHERE questionnaire_session_id=? AND status='draft' AND EXISTS(SELECT 1 FROM questionnaire_sessions WHERE id=?)").bind(next,id,next),
    db.prepare("UPDATE submissions SET posttest_session_id=? WHERE posttest_session_id=? AND status='draft' AND EXISTS(SELECT 1 FROM questionnaire_sessions WHERE id=?)").bind(next,id,next),
  ]).catch(async error => {
    // A second tab can win the rotation; only suppress that specific, completed race.
    if (await currentSessionId(db,userId,id)===id) throw error;
  });
  const sessionId=await currentSessionId(db,userId,id);
  return {sessionId,updated:sessionId!==initialId};
}

export async function readQuestionnaireSession(db:D1Database,userId:string,id:string) {
  const session=await db.prepare(`SELECT s.id,s.completed_at,q.id questionnaire_id,q.questionnaire_key,q.version,q.title
    FROM questionnaire_sessions s JOIN questionnaires q ON q.id=s.questionnaire_id WHERE s.id=? AND s.user_id=?`).bind(id,userId).first<{id:string;completed_at:string|null;questionnaire_id:string;questionnaire_key:string;version:string;title:string}>();
  if(!session) return null;
  const rows=await db.batch<Record<string,unknown>>([
    db.prepare("SELECT id,question_key,prompt_th,type,required,options_json FROM questions WHERE questionnaire_id=? ORDER BY sort_order").bind(session.questionnaire_id),
    db.prepare("SELECT question_id,value_json FROM responses WHERE session_id=?").bind(id),
  ]);
  return {id:session.questionnaire_id,key:session.questionnaire_key,sessionId:id,title:session.title,version:session.version,completed:!!session.completed_at,
    questions:rows[0].results.map(q=>({id:String(q.id),key:String(q.question_key),promptTh:String(q.prompt_th),type:String(q.type),required:q.required===1,options:JSON.parse(String(q.options_json)) as unknown})),
    responses:rows[1].results.reduce<Record<string,unknown>>((saved,r)=>{
      try { saved[String(r.question_id)]=JSON.parse(String(r.value_json)) as unknown; } catch { /* Ignore malformed historical values, retaining their database record. */ }
      return saved;
    },{})};
}
