-- Canonicalize the public identity of the merged WA VE case.
-- The legacy Psychology and Human-focused Biotech subgame IDs remain aliases so
-- existing progress and recommendations are not detached from their history.
UPDATE timeline_nodes
SET summary = 'คดี Bio ที่ตรวจสอบข้อมูลชีวภาพ พฤติกรรม การเข้าถึง และการสื่อสาร'
WHERE id = 'timeline-ka-wa-ve';

UPDATE subgames
SET academic_field = 'biotech',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'subgame-ka-wa-ve';

UPDATE recommendation_rules
SET rule_json = '{"fields":["biotech"],"problemStyleKeys":["biology_health"],"weights":{"interest":0.5,"problemStyle":0.25,"confidenceGap":0.25,"diagnosticFit":0}}'
WHERE id = 'recommendation-rule-ka-wa-ve-netlood-city-v1';

INSERT INTO app_metadata (key, value)
VALUES ('schema_version', '0013_ka_wave_bio_label')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
