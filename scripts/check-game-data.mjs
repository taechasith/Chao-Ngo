import process from "node:process";
import console from "node:console";
import { spawnSync } from "node:child_process";

// Read-only. Report counts/column names only; never answer bodies, emails or keys.
const remote = process.argv.includes("--remote");
const queries = [
  "SELECT name FROM pragma_table_info('user_profiles')",
  `SELECT 'accounts' AS record_type, COUNT(*) AS stored_records FROM "user"
   UNION ALL SELECT 'player_profiles', COUNT(*) FROM user_profiles
   UNION ALL SELECT 'answer_values', COUNT(*) FROM responses
   UNION ALL SELECT 'questionnaire_sessions', COUNT(*) FROM questionnaire_sessions
   UNION ALL SELECT 'submitted_cases', COUNT(*) FROM submissions WHERE status IN ('submitted','accepted','needs_revision')
   UNION ALL SELECT 'private_uploads', COUNT(*) FROM uploads WHERE status IN ('uploaded','accepted')`,
  "SELECT name FROM pragma_table_info('submissions')",
  "SELECT name FROM pragma_table_info('questionnaire_sessions')",
  `SELECT COUNT(*) AS submissions_missing_answer_session FROM submissions s
     LEFT JOIN questionnaire_sessions qs ON qs.id = s.questionnaire_session_id
    WHERE s.questionnaire_session_id IS NOT NULL AND qs.id IS NULL`,
];
const results = [];
for (const query of queries) {
  const command = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", remote ? "--remote" : "--local", "--command", query, "--json"], {
    encoding: "utf8", env: { ...process.env, WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? "/private/tmp/chao-ngo-data-check.log" },
  });
  if (command.status !== 0) {
    console.error("Read-only game data check failed. Verify D1 access and database bindings; no data was changed.");
    process.exit(1);
  }
  try { results.push(JSON.parse(command.stdout)); }
  catch { throw new Error("Unexpected D1 result format; no data was changed."); }
}
const rows = results.map(result => result.flatMap(item => item.results ?? []));
if (!rows[0].some(column => column.name === "personal_skills_json")) {
  console.error("Missing profile migration 0014_research_profile_skills.sql. Apply reviewed D1 migrations before deploying.");
  process.exit(1);
}
if (!["reviewer_note", "revision_of_submission_id"].every(name => rows[2].some(column => column.name === name))) {
  console.error("Missing migration 0015_submission_reviews.sql. Apply reviewed D1 migrations before deploying.");
  process.exit(1);
}
if (!rows[3].some(column => column.name === "closed_at")) {
  console.error("Missing questionnaire closure migration 0015_submission_reviews.sql."); process.exit(1);
}
console.log(JSON.stringify({ environment: remote ? "production" : "local", profileSchemaReady: true, counts: rows[1], reviewSchemaReady: true, integrity: rows[4] }, null, 2));
if (rows[4].some(row => row.submissions_missing_answer_session !== 0)) process.exit(1);
