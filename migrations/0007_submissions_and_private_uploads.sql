CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  subgame_id TEXT NOT NULL REFERENCES subgames(id) ON DELETE RESTRICT,
  questionnaire_session_id TEXT REFERENCES questionnaire_sessions(id) ON DELETE SET NULL,
  posttest_session_id TEXT REFERENCES questionnaire_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'needs_revision', 'accepted')),
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by_admin_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS submissions_user_subgame_draft_unique_idx
  ON submissions (user_id, subgame_id)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS submissions_user_status_idx
  ON submissions (user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ai_chat_pdf', 'answer_attachment')),
  private_r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 20971520),
  mime_declared TEXT NOT NULL,
  mime_detected TEXT,
  sha256 TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'uploaded', 'accepted', 'rejected', 'quarantined')),
  rejection_reason TEXT,
  uploaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS uploads_submission_status_idx
  ON uploads (submission_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS upload_authorizations (
  id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS upload_authorizations_upload_idx
  ON upload_authorizations (upload_id, expires_at);

INSERT INTO questionnaires (id, questionnaire_key, version, title, published)
VALUES
  ('questionnaire-submission-node-zone-quantum-v1', 'submission:subgame-node-zone-quantum', '1.0.0', 'ส่งคำตอบคดีควอนตัม', 1),
  ('questionnaire-submission-node-zone-space-v1', 'submission:subgame-node-zone-space', '1.0.0', 'ส่งคำตอบคดีอวกาศ', 1),
  ('questionnaire-postgame-node-zone-quantum-v1', 'postgame:subgame-node-zone-quantum', '1.0.0', 'หลังเล่นคดีควอนตัม', 1),
  ('questionnaire-postgame-node-zone-space-v1', 'postgame:subgame-node-zone-space', '1.0.0', 'หลังเล่นคดีอวกาศ', 1);

INSERT INTO questions (
  id, questionnaire_id, question_key, prompt_th, type, required, options_json,
  scoring_json, research_construct, sort_order
)
VALUES
  ('question-submission-quantum-answer', 'questionnaire-submission-node-zone-quantum-v1', 'case_answer', 'คำตอบสุดท้ายของคุณสำหรับคดีนี้คืออะไร', 'long', 1, '{}', NULL, 'submission_answer', 10),
  ('question-submission-quantum-evidence', 'questionnaire-submission-node-zone-quantum-v1', 'supporting_evidence', 'หลักฐานใดทำให้คุณคิดเช่นนั้น', 'long', 1, '{}', NULL, 'evidence_reasoning', 20),
  ('question-submission-quantum-confidence', 'questionnaire-submission-node-zone-quantum-v1', 'answer_confidence', 'คุณมั่นใจกับคำตอบนี้มากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'answer_confidence', 30),
  ('question-submission-space-answer', 'questionnaire-submission-node-zone-space-v1', 'case_answer', 'คำตอบสุดท้ายของคุณสำหรับคดีนี้คืออะไร', 'long', 1, '{}', NULL, 'submission_answer', 10),
  ('question-submission-space-evidence', 'questionnaire-submission-node-zone-space-v1', 'supporting_evidence', 'หลักฐานใดทำให้คุณคิดเช่นนั้น', 'long', 1, '{}', NULL, 'evidence_reasoning', 20),
  ('question-submission-space-confidence', 'questionnaire-submission-node-zone-space-v1', 'answer_confidence', 'คุณมั่นใจกับคำตอบนี้มากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'answer_confidence', 30),

  ('question-postgame-quantum-explain', 'questionnaire-postgame-node-zone-quantum-v1', 'concept_explanation', 'หลังเล่นคดีนี้ คุณอธิบายแนวคิดวิทยาศาสตร์สำคัญที่เกี่ยวข้องได้อย่างไร', 'long', 1, '{}', NULL, 'postgame_explanation', 10),
  ('question-postgame-quantum-confidence', 'questionnaire-postgame-node-zone-quantum-v1', 'science_confidence_after', 'ตอนนี้คุณมั่นใจในการทำความเข้าใจแนวคิดของคดีนี้มากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'science_confidence_after', 20),
  ('question-postgame-quantum-evidence-help', 'questionnaire-postgame-node-zone-quantum-v1', 'evidence_helpfulness', 'หลักฐานในคดีช่วยให้คุณคิดเรื่องวิทยาศาสตร์มากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'evidence_helpfulness', 30),
  ('question-postgame-quantum-ai-help', 'questionnaire-postgame-node-zone-quantum-v1', 'ai_helpfulness', 'ถ้าคุณใช้ AI คู่คิด AI ช่วยให้คุณมองหลักฐานหรือแนวคิดจากอีกมุมมากน้อยเพียงใด', 'scale', 0, '{"min":1,"max":5}', NULL, 'ai_helpfulness', 40),
  ('question-postgame-space-explain', 'questionnaire-postgame-node-zone-space-v1', 'concept_explanation', 'หลังเล่นคดีนี้ คุณอธิบายแนวคิดวิทยาศาสตร์สำคัญที่เกี่ยวข้องได้อย่างไร', 'long', 1, '{}', NULL, 'postgame_explanation', 10),
  ('question-postgame-space-confidence', 'questionnaire-postgame-node-zone-space-v1', 'science_confidence_after', 'ตอนนี้คุณมั่นใจในการทำความเข้าใจแนวคิดของคดีนี้มากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'science_confidence_after', 20),
  ('question-postgame-space-evidence-help', 'questionnaire-postgame-node-zone-space-v1', 'evidence_helpfulness', 'หลักฐานในคดีช่วยให้คุณคิดเรื่องวิทยาศาสตร์มากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'evidence_helpfulness', 30),
  ('question-postgame-space-ai-help', 'questionnaire-postgame-node-zone-space-v1', 'ai_helpfulness', 'ถ้าคุณใช้ AI คู่คิด AI ช่วยให้คุณมองหลักฐานหรือแนวคิดจากอีกมุมมากน้อยเพียงใด', 'scale', 0, '{"min":1,"max":5}', NULL, 'ai_helpfulness', 40);

INSERT INTO app_metadata (key, value)
VALUES ('schema_version', '0007_submissions_and_private_uploads')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
