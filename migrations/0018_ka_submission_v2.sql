-- Publish a new instrument; never rewrite questions attached to submitted work.
UPDATE questionnaires SET published = 0 WHERE questionnaire_key IN
  ('submission:subgame-ka-fintech', 'submission:subgame-ka-wa-ve');
INSERT INTO questionnaires (id, questionnaire_key, version, title, published) VALUES
  ('questionnaire-submission-ka-maimee-v2','submission:subgame-ka-fintech','ka-submission-v2','ส่งคำตอบคดี MAIMEE',1),
  ('questionnaire-submission-ka-wa-ve-v2','submission:subgame-ka-wa-ve','ka-submission-v2','ส่งคำตอบคดี WA VE',1);
INSERT INTO questions (id, questionnaire_id, question_key, prompt_th, type, required, options_json, research_construct, sort_order) VALUES
  ('question-ka-maimee-v2-case_summary','questionnaire-submission-ka-maimee-v2','case_summary','บทสรุปของคดีนี้คืออะไร','long',1,'{}','ka_case_summary',10),
  ('question-ka-maimee-v2-reasoning','questionnaire-submission-ka-maimee-v2','reasoning','อะไรที่ทำให้คุณคิดเช่นนั้น','long',1,'{}','ka_reasoning',20),
  ('question-ka-maimee-v2-domain_problems','questionnaire-submission-ka-maimee-v2','domain_problems','ปัญหาด้าน Finance ในคดีนี้มีอะไรบ้าง','long',1,'{}','ka_domain_problems',30),
  ('question-ka-maimee-v2-innovation','questionnaire-submission-ka-maimee-v2','innovation','นวัตกรรมที่คุณจะสร้างคืออะไร','long',1,'{}','ka_innovation',40),
  ('question-ka-maimee-v2-answer_confidence','questionnaire-submission-ka-maimee-v2','answer_confidence','คุณมั่นใจในคำตอบของคุณมากน้อยเพียงใด','scale',1,'{"min":1,"max":5}','ka_answer_confidence',50),
  ('question-ka-maimee-v2-ai_chat_link','questionnaire-submission-ka-maimee-v2','ai_chat_link','ลิงก์บทสนทนากับ AI ที่คุณใช้ช่วยคิด','short',1,'{"format":"https-url"}','ka_ai_chat_link',60),
  ('question-ka-wa-ve-v2-case_summary','questionnaire-submission-ka-wa-ve-v2','case_summary','บทสรุปของคดีนี้คืออะไร','long',1,'{}','ka_case_summary',10),
  ('question-ka-wa-ve-v2-reasoning','questionnaire-submission-ka-wa-ve-v2','reasoning','อะไรที่ทำให้คุณคิดเช่นนั้น','long',1,'{}','ka_reasoning',20),
  ('question-ka-wa-ve-v2-domain_problems','questionnaire-submission-ka-wa-ve-v2','domain_problems','ปัญหาด้าน Bio ในคดีนี้มีอะไรบ้าง','long',1,'{}','ka_domain_problems',30),
  ('question-ka-wa-ve-v2-innovation','questionnaire-submission-ka-wa-ve-v2','innovation','นวัตกรรมที่คุณจะสร้างคืออะไร','long',1,'{}','ka_innovation',40),
  ('question-ka-wa-ve-v2-answer_confidence','questionnaire-submission-ka-wa-ve-v2','answer_confidence','คุณมั่นใจในคำตอบของคุณมากน้อยเพียงใด','scale',1,'{"min":1,"max":5}','ka_answer_confidence',50),
  ('question-ka-wa-ve-v2-ai_chat_link','questionnaire-submission-ka-wa-ve-v2','ai_chat_link','ลิงก์บทสนทนากับ AI ที่คุณใช้ช่วยคิด','short',1,'{"format":"https-url"}','ka_ai_chat_link',60);

UPDATE subgame_submission_requirements SET
  version = 'ka-submission-v2', answer_mode = 'text',
  allowed_artifact_extensions_json = '["pdf","pptx"]',
  requirements_json = '{"requiresAnswerAttachment":true,"requiresAnswerForm":true,"requiresAiChatLink":true,"textRequiredQuestionKeys":["case_summary","reasoning","domain_problems","innovation","ai_chat_link"]}',
  requires_ai_chat_pdf = 0, requires_posttest = 0, updated_at = CURRENT_TIMESTAMP
WHERE subgame_id IN ('subgame-ka-fintech','subgame-ka-wa-ve');

-- Keep the original draft sessions/responses as history. Copy only compatible
-- text into a new session; confidence, domain problems and AI link need answers.
CREATE TABLE submission_form_migrations (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  previous_session_id TEXT NOT NULL REFERENCES questionnaire_sessions(id) ON DELETE RESTRICT,
  current_session_id TEXT NOT NULL REFERENCES questionnaire_sessions(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO questionnaire_sessions (id, user_id, questionnaire_id)
SELECT s.questionnaire_session_id || '-ka-v2', s.user_id,
  CASE s.subgame_id WHEN 'subgame-ka-fintech' THEN 'questionnaire-submission-ka-maimee-v2' ELSE 'questionnaire-submission-ka-wa-ve-v2' END
FROM submissions s JOIN questionnaire_sessions qs ON qs.id = s.questionnaire_session_id
JOIN questionnaires q ON q.id = qs.questionnaire_id
WHERE s.status = 'draft' AND s.subgame_id IN ('subgame-ka-fintech','subgame-ka-wa-ve') AND q.version <> 'ka-submission-v2';
INSERT INTO submission_form_migrations (submission_id, previous_session_id, current_session_id)
SELECT s.id, s.questionnaire_session_id, s.questionnaire_session_id || '-ka-v2'
FROM submissions s JOIN questionnaire_sessions qs ON qs.id = s.questionnaire_session_id
JOIN questionnaires q ON q.id = qs.questionnaire_id
WHERE s.status = 'draft' AND s.subgame_id IN ('subgame-ka-fintech','subgame-ka-wa-ve') AND q.version <> 'ka-submission-v2';

UPDATE questionnaire_sessions SET closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP)
WHERE id IN (SELECT previous_session_id FROM submission_form_migrations);
INSERT INTO responses (id, session_id, question_id, value_json)
SELECT r.id || '-ka-v2', m.current_session_id, new_q.id, r.value_json
FROM submission_form_migrations m
JOIN questionnaire_sessions new_s ON new_s.id = m.current_session_id
JOIN responses r ON r.session_id = m.previous_session_id
JOIN questions old_q ON old_q.id = r.question_id
JOIN questions new_q ON new_q.questionnaire_id = new_s.questionnaire_id AND new_q.question_key =
  CASE old_q.question_key WHEN 'case_truth_model' THEN 'case_summary'
    WHEN 'evidence_reasoning' THEN 'reasoning' WHEN 'prevention_system' THEN 'innovation' END;
UPDATE submissions SET questionnaire_session_id =
  (SELECT current_session_id FROM submission_form_migrations WHERE submission_id = submissions.id), updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT submission_id FROM submission_form_migrations);
-- Non-slide artifacts stay in private storage/history but cannot satisfy the new contract.
UPDATE uploads SET status = 'rejected', rejection_reason = 'แบบฟอร์มใหม่ต้องแนบสไลด์ PDF หรือ PPTX', updated_at = CURRENT_TIMESTAMP
WHERE submission_id IN (SELECT submission_id FROM submission_form_migrations) AND kind = 'answer_attachment'
AND status IN ('uploaded','accepted') AND lower(original_name) NOT LIKE '%.pdf' AND lower(original_name) NOT LIKE '%.pptx';
INSERT INTO app_metadata (key, value) VALUES ('schema_version','0018_ka_submission_v2')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
