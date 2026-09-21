CREATE TABLE IF NOT EXISTS questionnaires (
  id TEXT PRIMARY KEY,
  questionnaire_key TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  published INTEGER NOT NULL CHECK (published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (questionnaire_key, version)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  questionnaire_id TEXT NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  prompt_th TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('single', 'multi', 'scale', 'short', 'long', 'file')),
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  options_json TEXT NOT NULL,
  scoring_json TEXT,
  research_construct TEXT,
  sort_order INTEGER NOT NULL,
  UNIQUE (questionnaire_id, question_key)
);

CREATE INDEX IF NOT EXISTS questions_questionnaire_id_sort_order_idx
  ON questions (questionnaire_id, sort_order);

CREATE TABLE IF NOT EXISTS questionnaire_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  questionnaire_id TEXT NOT NULL REFERENCES questionnaires(id) ON DELETE RESTRICT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  score_json TEXT
);

CREATE INDEX IF NOT EXISTS questionnaire_sessions_user_id_started_at_idx
  ON questionnaire_sessions (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES questionnaire_sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  value_json TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS responses_session_id_idx ON responses (session_id);

CREATE TABLE IF NOT EXISTS recommendation_rules (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  target_subgame_id TEXT NOT NULL REFERENCES subgames(id) ON DELETE CASCADE,
  rule_json TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  UNIQUE (version, target_subgame_id)
);

CREATE TABLE IF NOT EXISTS recommendation_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  questionnaire_session_id TEXT NOT NULL UNIQUE REFERENCES questionnaire_sessions(id) ON DELETE CASCADE,
  rule_version TEXT NOT NULL,
  recommended_subgame_id TEXT NOT NULL REFERENCES subgames(id) ON DELETE RESTRICT,
  score_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO questionnaires (id, questionnaire_key, version, title, published)
VALUES (
  'questionnaire-pregame-v1',
  'pregame',
  '1.0.0',
  'แบบสอบถามก่อนเริ่มเล่น',
  1
);

INSERT INTO questions (
  id, questionnaire_id, question_key, prompt_th, type, required, options_json,
  scoring_json, research_construct, sort_order
)
VALUES
  ('question-pregame-age', 'questionnaire-pregame-v1', 'age', 'อายุของคุณ (ปี)', 'short', 1, '{}', NULL, 'demographic_age', 10),
  ('question-pregame-education', 'questionnaire-pregame-v1', 'education_level', 'ระดับการศึกษา', 'single', 1, '[{"value":"lower_secondary","label":"ม.ต้น"},{"value":"upper_secondary","label":"ม.ปลาย"},{"value":"vocational","label":"ปวช.-ปวส."},{"value":"bachelor","label":"ปริญญาตรี"},{"value":"other","label":"อื่นๆ"}]', NULL, 'education_level', 20),
  ('question-pregame-gender', 'questionnaire-pregame-v1', 'gender', 'เพศ', 'single', 1, '[{"value":"male","label":"ชาย"},{"value":"female","label":"หญิง"},{"value":"nonbinary_or_self_described","label":"non-binary-or-self-described"},{"value":"prefer_not_to_say","label":"ไม่ประสงค์ระบุ"}]', NULL, 'gender_optional', 30),
  ('question-pregame-institution', 'questionnaire-pregame-v1', 'institution', 'สถานศึกษา (ถ้าประสงค์ระบุ)', 'short', 0, '{}', NULL, 'institution_optional', 40),
  ('question-pregame-science-interest', 'questionnaire-pregame-v1', 'overall_science_interest', 'คุณสนใจวิทยาศาสตร์โดยรวมมากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'science_interest', 50),
  ('question-pregame-game-learning-frequency', 'questionnaire-pregame-v1', 'prior_game_based_learning_frequency', 'คุณเคยเรียนรู้ผ่านเกมบ่อยเพียงใด', 'scale', 0, '{"min":1,"max":5}', NULL, 'prior_game_based_learning_frequency', 60),
  ('question-pregame-interest-quantum', 'questionnaire-pregame-v1', 'field_interest_quantum', 'คุณสนใจฟิสิกส์ควอนตัมมากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'field_interest_quantum', 70),
  ('question-pregame-interest-space', 'questionnaire-pregame-v1', 'field_interest_space', 'คุณสนใจวิทยาศาสตร์อวกาศมากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'field_interest_space', 80),
  ('question-pregame-interest-psychology', 'questionnaire-pregame-v1', 'field_interest_psychology', 'คุณสนใจจิตวิทยามากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'field_interest_psychology', 90),
  ('question-pregame-interest-fintech', 'questionnaire-pregame-v1', 'field_interest_fintech', 'คุณสนใจ FinTech มากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'field_interest_fintech', 100),
  ('question-pregame-interest-biotech', 'questionnaire-pregame-v1', 'field_interest_biotech', 'คุณสนใจชีวเทคโนโลยีที่เกี่ยวข้องกับมนุษย์มากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'field_interest_biotech', 110),
  ('question-pregame-familiarity-quantum', 'questionnaire-pregame-v1', 'field_familiarity_quantum', 'คุณคุ้นเคยกับฟิสิกส์ควอนตัมมากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'field_familiarity_quantum', 120),
  ('question-pregame-familiarity-space', 'questionnaire-pregame-v1', 'field_familiarity_space', 'คุณคุ้นเคยกับวิทยาศาสตร์อวกาศมากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'field_familiarity_space', 130),
  ('question-pregame-familiarity-psychology', 'questionnaire-pregame-v1', 'field_familiarity_psychology', 'คุณคุ้นเคยกับจิตวิทยามากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'field_familiarity_psychology', 140),
  ('question-pregame-familiarity-fintech', 'questionnaire-pregame-v1', 'field_familiarity_fintech', 'คุณคุ้นเคยกับ FinTech มากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'field_familiarity_fintech', 150),
  ('question-pregame-familiarity-biotech', 'questionnaire-pregame-v1', 'field_familiarity_biotech', 'คุณคุ้นเคยกับชีวเทคโนโลยีที่เกี่ยวข้องกับมนุษย์มากน้อยเพียงใด', 'scale', 1, '{"min":1,"max":5}', NULL, 'field_familiarity_biotech', 160),
  ('question-pregame-problem-style', 'questionnaire-pregame-v1', 'preferred_problem_style', 'รูปแบบปัญหาที่คุณอยากลองแก้ (เลือกได้มากกว่า 1 ข้อ)', 'multi', 1, '[{"value":"math_data","label":"คณิตศาสตร์/ข้อมูล"},{"value":"pattern_puzzle","label":"รูปแบบ/ปริศนา"},{"value":"human_behavior","label":"พฤติกรรมมนุษย์"},{"value":"biology_health","label":"ชีววิทยา/สุขภาพ"},{"value":"systems_economy","label":"ระบบ/เศรษฐกิจ"},{"value":"space_engineering","label":"อวกาศ/วิศวกรรม"}]', NULL, 'preferred_problem_style', 170);

INSERT INTO recommendation_rules (id, version, target_subgame_id, rule_json, active)
VALUES
  (
    'recommendation-rule-quantum-v1',
    '1.0.0',
    'subgame-node-zone-quantum',
    '{"field":"quantum","problemStyleKeys":["math_data","pattern_puzzle"],"weights":{"interest":0.5,"problemStyle":0.2,"confidenceGap":0.15,"diagnosticFit":0.15},"diagnosticStatus":"unavailable"}',
    1
  ),
  (
    'recommendation-rule-space-v1',
    '1.0.0',
    'subgame-node-zone-space',
    '{"field":"space","problemStyleKeys":["space_engineering","systems_economy"],"weights":{"interest":0.5,"problemStyle":0.2,"confidenceGap":0.15,"diagnosticFit":0.15},"diagnosticStatus":"unavailable"}',
    1
  );

INSERT INTO app_metadata (key, value)
VALUES ('schema_version', '0004_questionnaires_and_recommendations')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
