-- NETLOOD CITY is an additive K.A. Casefiles transition.  Existing Psychology,
-- Biotech, FinTech, progress, submissions, events, and recommendation results
-- keep their original identifiers; nothing in this migration deletes or rewrites
-- historical research records.

UPDATE games
SET
  status = 'playable',
  description = 'NETLOOD CITY: คดี MAIMEE และ WA VE เปิดให้สำรวจแล้ว',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'game-ka-casefiles';

-- The source folder supplies a shared city context and personnel dossier, then
-- two casefiles.  These IDs match the asset importer and remain stable for
-- activity-event provenance.
INSERT INTO timeline_nodes (
  id, game_id, slug, title, summary, node_type, sort_order, published
)
VALUES
  (
    'timeline-ka-netlood-city',
    'game-ka-casefiles',
    'netlood-city',
    'NETLOOD CITY',
    'บริบทก่อนเข้าสู่แฟ้มคดี',
    'intro',
    10,
    1
  ),
  (
    'timeline-ka-personnel',
    'game-ka-casefiles',
    'personnel',
    'บุคลากรในบริษัท',
    'แฟ้มบุคลากรที่เกี่ยวข้องกับทั้งสองคดี',
    'context',
    20,
    1
  ),
  (
    'timeline-ka-maimee',
    'game-ka-casefiles',
    'maimee',
    'คดี MAIMEE',
    'คดี FinTech ที่ตรวจสอบหลักฐานทางกายภาพ ดิจิทัล การเงิน และไทม์ไลน์',
    'subgame',
    30,
    1
  ),
  (
    'timeline-ka-wa-ve',
    'game-ka-casefiles',
    'wa-ve',
    'คดี WA VE',
    'คดี Bio x Psychology ที่ตรวจสอบข้อมูลชีวภาพ พฤติกรรม การเข้าถึง และการสื่อสาร',
    'subgame',
    40,
    1
  )
ON CONFLICT(game_id, slug) DO UPDATE SET
  title = excluded.title,
  summary = excluded.summary,
  node_type = excluded.node_type,
  sort_order = excluded.sort_order,
  published = excluded.published;

-- Keep the pre-existing FinTech identifier so any current or historical records
-- remain attached to the same subgame.  Only its current public identity changes.
INSERT INTO subgames (
  id, game_id, slug, title, academic_field, status, timeline_node_id,
  entry_difficulty, required_for_completion
)
VALUES (
  'subgame-ka-fintech',
  'game-ka-casefiles',
  'maimee',
  'คดี MAIMEE',
  'fintech',
  'playable',
  'timeline-ka-maimee',
  'standard',
  0
)
ON CONFLICT(id) DO UPDATE SET
  game_id = excluded.game_id,
  slug = excluded.slug,
  title = excluded.title,
  academic_field = excluded.academic_field,
  status = excluded.status,
  timeline_node_id = excluded.timeline_node_id,
  entry_difficulty = excluded.entry_difficulty,
  required_for_completion = excluded.required_for_completion,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO subgames (
  id, game_id, slug, title, academic_field, status, timeline_node_id,
  entry_difficulty, required_for_completion
)
VALUES (
  'subgame-ka-wa-ve',
  'game-ka-casefiles',
  'wa-ve',
  'คดี WA VE',
  'bio_x_psychology',
  'playable',
  'timeline-ka-wa-ve',
  'standard',
  0
)
ON CONFLICT(id) DO UPDATE SET
  game_id = excluded.game_id,
  slug = excluded.slug,
  title = excluded.title,
  academic_field = excluded.academic_field,
  status = excluded.status,
  timeline_node_id = excluded.timeline_node_id,
  entry_difficulty = excluded.entry_difficulty,
  required_for_completion = excluded.required_for_completion,
  updated_at = CURRENT_TIMESTAMP;

-- Legacy studies must remain queryable, but are not selectable current content
-- and must not change letter/completion eligibility.
UPDATE subgames
SET
  status = 'hidden',
  required_for_completion = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE id IN ('subgame-ka-psychology', 'subgame-ka-biotech');

CREATE TABLE IF NOT EXISTS subgame_aliases (
  legacy_subgame_id TEXT PRIMARY KEY REFERENCES subgames(id) ON DELETE RESTRICT,
  canonical_subgame_id TEXT NOT NULL REFERENCES subgames(id) ON DELETE RESTRICT,
  migration_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (legacy_subgame_id <> canonical_subgame_id)
);

CREATE INDEX IF NOT EXISTS subgame_aliases_canonical_subgame_id_idx
  ON subgame_aliases (canonical_subgame_id);

INSERT INTO subgame_aliases (
  legacy_subgame_id, canonical_subgame_id, migration_version
)
VALUES
  ('subgame-ka-psychology', 'subgame-ka-wa-ve', 'netlood-city-v1'),
  ('subgame-ka-biotech', 'subgame-ka-wa-ve', 'netlood-city-v1')
ON CONFLICT(legacy_subgame_id) DO UPDATE SET
  canonical_subgame_id = excluded.canonical_subgame_id,
  migration_version = excluded.migration_version,
  updated_at = CURRENT_TIMESTAMP;

-- The source requires one answer artifact: text in the system OR a permitted
-- attachment.  It does not require a post-test or an AI-chat PDF.
CREATE TABLE IF NOT EXISTS subgame_submission_requirements (
  subgame_id TEXT PRIMARY KEY REFERENCES subgames(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  answer_mode TEXT NOT NULL CHECK (answer_mode IN ('text', 'attachment', 'text_or_attachment')),
  allowed_artifact_extensions_json TEXT NOT NULL CHECK (json_valid(allowed_artifact_extensions_json)),
  requirements_json TEXT NOT NULL CHECK (json_valid(requirements_json)),
  requires_ai_chat_pdf INTEGER NOT NULL DEFAULT 0 CHECK (requires_ai_chat_pdf IN (0, 1)),
  requires_posttest INTEGER NOT NULL DEFAULT 0 CHECK (requires_posttest IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO subgame_submission_requirements (
  subgame_id,
  version,
  answer_mode,
  allowed_artifact_extensions_json,
  requirements_json,
  requires_ai_chat_pdf,
  requires_posttest
)
VALUES
  (
    'subgame-ka-fintech',
    'netlood-city-submission-v1',
    'text_or_attachment',
    '["txt","docx","pdf","pptx","png","jpg","jpeg"]',
    '{"minimumTimelinePoints":3,"minimumEvidenceItems":3,"minimumEvidenceTypes":2,"requiresAlternativeHypothesis":true,"requiresEvidenceLimitations":true,"certaintyLevels":["confirmed","inferred","unknown"],"requiresPreventionSystem":true,"minimumPreventionLayers":2,"minimumSystemLimitations":2,"requiresPrivacyFairnessAssessment":true,"textRequiredQuestionKeys":["case_truth_model","case_timeline","evidence_reasoning","alternative_hypothesis","prevention_system","prevention_limits_and_ethics","intervention_outcome"]}',
    0,
    0
  ),
  (
    'subgame-ka-wa-ve',
    'netlood-city-submission-v1',
    'text_or_attachment',
    '["txt","docx","pdf","pptx","png","jpg","jpeg"]',
    '{"minimumTimelinePoints":3,"minimumEvidenceItems":3,"minimumEvidenceTypes":2,"requiresAlternativeHypothesis":true,"requiresEvidenceLimitations":true,"certaintyLevels":["confirmed","inferred","unknown"],"requiresPreventionSystem":true,"minimumPreventionLayers":2,"minimumSystemLimitations":2,"requiresPrivacyFairnessAssessment":true,"textRequiredQuestionKeys":["case_truth_model","case_timeline","evidence_reasoning","alternative_hypothesis","prevention_system","prevention_limits_and_ethics","intervention_outcome"]}',
    0,
    0
  )
ON CONFLICT(subgame_id) DO UPDATE SET
  version = excluded.version,
  answer_mode = excluded.answer_mode,
  allowed_artifact_extensions_json = excluded.allowed_artifact_extensions_json,
  requirements_json = excluded.requirements_json,
  requires_ai_chat_pdf = excluded.requires_ai_chat_pdf,
  requires_posttest = excluded.requires_posttest,
  updated_at = CURRENT_TIMESTAMP;

-- These forms are the structured in-system alternative to a single uploaded
-- artifact.  Individual long fields are optional at the database layer because
-- the requirements table makes the text branch conditional on no attachment.
INSERT INTO questionnaires (id, questionnaire_key, version, title, published)
VALUES
  (
    'questionnaire-submission-ka-maimee-netlood-city-v1',
    'submission:subgame-ka-fintech',
    'netlood-city-submission-v1',
    'ส่งภารกิจคดี MAIMEE',
    1
  ),
  (
    'questionnaire-submission-ka-wa-ve-netlood-city-v1',
    'submission:subgame-ka-wa-ve',
    'netlood-city-submission-v1',
    'ส่งภารกิจคดี WA VE',
    1
  )
ON CONFLICT(id) DO UPDATE SET
  questionnaire_key = excluded.questionnaire_key,
  version = excluded.version,
  title = excluded.title,
  published = excluded.published;

INSERT INTO questions (
  id, questionnaire_id, question_key, prompt_th, type, required, options_json,
  scoring_json, research_construct, sort_order
)
VALUES
  ('question-submission-ka-maimee-mode', 'questionnaire-submission-ka-maimee-netlood-city-v1', 'submission_mode', 'คุณจะส่งคำตอบในรูปแบบใด', 'single', 1, '[{"value":"text","label":"กรอกคำตอบในระบบ"},{"value":"attachment","label":"แนบผลงานหนึ่งชิ้น"}]', NULL, 'submission_format', 10),
  ('question-submission-ka-maimee-model', 'questionnaire-submission-ka-maimee-netlood-city-v1', 'case_truth_model', 'แบบจำลองความจริงของคดี: เกิดอะไรขึ้นกับเหยื่อ และห่วงโซ่เหตุการณ์ใดนำไปสู่ความเสี่ยงหรือการเสียชีวิต', 'long', 0, '{}', NULL, 'netlood_case_model', 20),
  ('question-submission-ka-maimee-timeline', 'questionnaire-submission-ka-maimee-netlood-city-v1', 'case_timeline', 'ไทม์ไลน์อย่างน้อย 3 จุด: ก่อนเกิดเหตุ / จุดเปลี่ยนสำคัญ / ผลที่ตามมา', 'long', 0, '{}', NULL, 'netlood_timeline_reasoning', 30),
  ('question-submission-ka-maimee-evidence', 'questionnaire-submission-ka-maimee-netlood-city-v1', 'evidence_reasoning', 'วิเคราะห์หลักฐานอย่างน้อย 3 ชิ้นจากอย่างน้อย 2 ประเภท: หลักฐานบอกอะไร ไม่บอกอะไร และทำให้สมมติฐานใดเข้มแข็งขึ้นหรืออ่อนลง', 'long', 0, '{}', NULL, 'netlood_evidence_reasoning', 40),
  ('question-submission-ka-maimee-alternative', 'questionnaire-submission-ka-maimee-netlood-city-v1', 'alternative_hypothesis', 'สมมติฐานทางเลือก พร้อมหลักฐานที่สนับสนุนหรือหักล้าง และแยกสิ่งที่ยืนยันได้ อนุมานได้ และยังไม่ทราบ', 'long', 0, '{}', NULL, 'netlood_uncertainty_reasoning', 50),
  ('question-submission-ka-maimee-system', 'questionnaire-submission-ka-maimee-netlood-city-v1', 'prevention_system', 'เทคโนโลยีหรือระบบที่อาจช่วยให้เหยื่อรอด: ผู้ที่ระบบช่วย ช่วงเวลาที่แทรกแซง ข้อมูลหรือสัญญาณ กลไกตรวจจับ และการตัดสินใจ', 'long', 0, '{}', NULL, 'netlood_prevention_design', 60),
  ('question-submission-ka-maimee-limits', 'questionnaire-submission-ka-maimee-netlood-city-v1', 'prevention_limits_and_ethics', 'การป้องกันอย่างน้อย 2 ชั้น ข้อจำกัดหรือ failure mode อย่างน้อย 2 ข้อ และปัจจัยมนุษย์ ความเป็นส่วนตัว หรือความเป็นธรรม', 'long', 0, '{}', NULL, 'netlood_prevention_limits', 70),
  ('question-submission-ka-maimee-outcome', 'questionnaire-submission-ka-maimee-netlood-city-v1', 'intervention_outcome', 'จุดในไทม์ไลน์ที่ระบบเข้าแทรกแซง หลักฐานที่รองรับ และผลลัพธ์ที่คาดว่าจะเปลี่ยนไปโดยไม่อ้างเกินหลักฐาน', 'long', 0, '{}', NULL, 'netlood_intervention_outcome', 80),

  ('question-submission-ka-wa-ve-mode', 'questionnaire-submission-ka-wa-ve-netlood-city-v1', 'submission_mode', 'คุณจะส่งคำตอบในรูปแบบใด', 'single', 1, '[{"value":"text","label":"กรอกคำตอบในระบบ"},{"value":"attachment","label":"แนบผลงานหนึ่งชิ้น"}]', NULL, 'submission_format', 10),
  ('question-submission-ka-wa-ve-model', 'questionnaire-submission-ka-wa-ve-netlood-city-v1', 'case_truth_model', 'แบบจำลองความจริงของคดี: เกิดอะไรขึ้นกับเหยื่อ และห่วงโซ่เหตุการณ์ใดนำไปสู่ความเสี่ยงหรือการเสียชีวิต', 'long', 0, '{}', NULL, 'netlood_case_model', 20),
  ('question-submission-ka-wa-ve-timeline', 'questionnaire-submission-ka-wa-ve-netlood-city-v1', 'case_timeline', 'ไทม์ไลน์อย่างน้อย 3 จุด: ก่อนเกิดเหตุ / จุดเปลี่ยนสำคัญ / ผลที่ตามมา', 'long', 0, '{}', NULL, 'netlood_timeline_reasoning', 30),
  ('question-submission-ka-wa-ve-evidence', 'questionnaire-submission-ka-wa-ve-netlood-city-v1', 'evidence_reasoning', 'วิเคราะห์หลักฐานอย่างน้อย 3 ชิ้นจากอย่างน้อย 2 ประเภท: หลักฐานบอกอะไร ไม่บอกอะไร และทำให้สมมติฐานใดเข้มแข็งขึ้นหรืออ่อนลง', 'long', 0, '{}', NULL, 'netlood_evidence_reasoning', 40),
  ('question-submission-ka-wa-ve-alternative', 'questionnaire-submission-ka-wa-ve-netlood-city-v1', 'alternative_hypothesis', 'สมมติฐานทางเลือก พร้อมหลักฐานที่สนับสนุนหรือหักล้าง และแยกสิ่งที่ยืนยันได้ อนุมานได้ และยังไม่ทราบ', 'long', 0, '{}', NULL, 'netlood_uncertainty_reasoning', 50),
  ('question-submission-ka-wa-ve-system', 'questionnaire-submission-ka-wa-ve-netlood-city-v1', 'prevention_system', 'เทคโนโลยีหรือระบบที่อาจช่วยให้เหยื่อรอด: ผู้ที่ระบบช่วย ช่วงเวลาที่แทรกแซง ข้อมูลหรือสัญญาณ กลไกตรวจจับ และการตัดสินใจ', 'long', 0, '{}', NULL, 'netlood_prevention_design', 60),
  ('question-submission-ka-wa-ve-limits', 'questionnaire-submission-ka-wa-ve-netlood-city-v1', 'prevention_limits_and_ethics', 'การป้องกันอย่างน้อย 2 ชั้น ข้อจำกัดหรือ failure mode อย่างน้อย 2 ข้อ และปัจจัยมนุษย์ ความเป็นส่วนตัว หรือความเป็นธรรม', 'long', 0, '{}', NULL, 'netlood_prevention_limits', 70),
  ('question-submission-ka-wa-ve-outcome', 'questionnaire-submission-ka-wa-ve-netlood-city-v1', 'intervention_outcome', 'จุดในไทม์ไลน์ที่ระบบเข้าแทรกแซง หลักฐานที่รองรับ และผลลัพธ์ที่คาดว่าจะเปลี่ยนไปโดยไม่อ้างเกินหลักฐาน', 'long', 0, '{}', NULL, 'netlood_intervention_outcome', 80)
ON CONFLICT(id) DO UPDATE SET
  questionnaire_id = excluded.questionnaire_id,
  question_key = excluded.question_key,
  prompt_th = excluded.prompt_th,
  type = excluded.type,
  required = excluded.required,
  options_json = excluded.options_json,
  scoring_json = excluded.scoring_json,
  research_construct = excluded.research_construct,
  sort_order = excluded.sort_order;

-- Older rules remain as historical records but cannot recommend hidden legacy
-- subgames.  The merged current route uses both source domains transparently.
UPDATE recommendation_rules
SET active = 0
WHERE target_subgame_id IN ('subgame-ka-psychology', 'subgame-ka-biotech');

INSERT INTO recommendation_rules (
  id, version, target_subgame_id, rule_json, active
)
VALUES (
  'recommendation-rule-ka-wa-ve-netlood-city-v1',
  'netlood-city-v1',
  'subgame-ka-wa-ve',
  '{"fields":["psychology","biotech"],"problemStyleKeys":["human_behavior","biology_health"],"weights":{"interest":0.5,"problemStyle":0.25,"confidenceGap":0.25,"diagnosticFit":0}}',
  1
)
ON CONFLICT(id) DO UPDATE SET
  version = excluded.version,
  target_subgame_id = excluded.target_subgame_id,
  rule_json = excluded.rule_json,
  active = excluded.active;

INSERT INTO app_metadata (key, value)
VALUES ('schema_version', '0012_ka_casefiles_netlood_city')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
