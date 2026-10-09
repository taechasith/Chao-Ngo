-- Change only file requirements. Keep every question, answer, receipt and old upload.
UPDATE subgame_submission_requirements SET
  answer_mode = 'text',
  allowed_artifact_extensions_json = '[]',
  requires_ai_chat_pdf = 1,
  requirements_json = json_set(requirements_json,
    '$.requiresAnswerAttachment', json('false'),
    '$.requiresAnswerForm', json('true'),
    '$.requiresAiChatLink', json('false')),
  updated_at = CURRENT_TIMESTAMP;
INSERT INTO app_metadata (key,value) VALUES ('schema_version','0022_ai_pdf_only')
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;
