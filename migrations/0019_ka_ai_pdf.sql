-- Replace AI share links in new work with a private PDF; retain old receipts.
CREATE TABLE questionnaire_publication_history (
 questionnaire_id TEXT PRIMARY KEY REFERENCES questionnaires(id) ON DELETE RESTRICT,
 published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO questionnaire_publication_history (questionnaire_id)
SELECT id FROM questionnaires WHERE published=1 OR id IN ('questionnaire-submission-ka-maimee-netlood-city-v1','questionnaire-submission-ka-wa-ve-netlood-city-v1');
UPDATE questionnaires SET published = 0 WHERE questionnaire_key IN ('submission:subgame-ka-fintech','submission:subgame-ka-wa-ve');
INSERT INTO questionnaires (id,questionnaire_key,version,title,published)
SELECT replace(id,'-v2','-v3'),questionnaire_key,'ka-submission-v3',title,1 FROM questionnaires
WHERE id IN ('questionnaire-submission-ka-maimee-v2','questionnaire-submission-ka-wa-ve-v2');
INSERT INTO questions (id,questionnaire_id,question_key,prompt_th,type,required,options_json,scoring_json,research_construct,sort_order)
SELECT replace(id,'-v2-','-v3-'),replace(questionnaire_id,'-v2','-v3'),question_key,prompt_th,type,required,options_json,scoring_json,research_construct,sort_order
FROM questions WHERE questionnaire_id IN ('questionnaire-submission-ka-maimee-v2','questionnaire-submission-ka-wa-ve-v2') AND question_key <> 'ai_chat_link';
UPDATE subgame_submission_requirements SET version='ka-submission-v3', requires_ai_chat_pdf=1,
requirements_json='{"requiresAnswerAttachment":true,"requiresAnswerForm":true,"textRequiredQuestionKeys":["case_summary","reasoning","domain_problems","innovation"]}',updated_at=CURRENT_TIMESTAMP
WHERE subgame_id IN ('subgame-ka-fintech','subgame-ka-wa-ve');
CREATE TABLE submission_form_history (
 submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
 previous_session_id TEXT NOT NULL REFERENCES questionnaire_sessions(id) ON DELETE RESTRICT,
 current_session_id TEXT NOT NULL REFERENCES questionnaire_sessions(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(submission_id,previous_session_id)
);
INSERT INTO submission_form_history SELECT submission_id,previous_session_id,current_session_id,created_at FROM submission_form_migrations;
INSERT INTO questionnaire_sessions (id,user_id,questionnaire_id)
SELECT s.questionnaire_session_id||'-ka-v3',s.user_id,CASE s.subgame_id WHEN 'subgame-ka-fintech' THEN 'questionnaire-submission-ka-maimee-v3' ELSE 'questionnaire-submission-ka-wa-ve-v3' END
FROM submissions s WHERE s.status='draft' AND s.subgame_id IN ('subgame-ka-fintech','subgame-ka-wa-ve');
INSERT INTO submission_form_history (submission_id,previous_session_id,current_session_id)
SELECT id,questionnaire_session_id,questionnaire_session_id||'-ka-v3' FROM submissions WHERE status='draft' AND subgame_id IN ('subgame-ka-fintech','subgame-ka-wa-ve');
INSERT INTO responses (id,session_id,question_id,value_json)
SELECT r.id||'-ka-v3',h.current_session_id,n.id,r.value_json FROM submission_form_history h
JOIN questionnaire_sessions ns ON ns.id=h.current_session_id JOIN responses r ON r.session_id=h.previous_session_id
JOIN questions o ON o.id=r.question_id JOIN questions n ON n.questionnaire_id=ns.questionnaire_id AND n.question_key=o.question_key
WHERE h.current_session_id LIKE '%-ka-v3';
UPDATE questionnaire_sessions SET closed_at=COALESCE(closed_at,CURRENT_TIMESTAMP) WHERE id IN (SELECT previous_session_id FROM submission_form_history WHERE current_session_id LIKE '%-ka-v3');
UPDATE submissions SET questionnaire_session_id=questionnaire_session_id||'-ka-v3',updated_at=CURRENT_TIMESTAMP WHERE status='draft' AND subgame_id IN ('subgame-ka-fintech','subgame-ka-wa-ve');
INSERT INTO app_metadata (key,value) VALUES ('schema_version','0019_ka_ai_pdf') ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO questionnaire_publication_history (questionnaire_id) SELECT id FROM questionnaires WHERE published=1;
