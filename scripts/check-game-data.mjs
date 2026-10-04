import process from "node:process";
import console from "node:console";
import { spawnSync } from "node:child_process";

// Read-only. Report counts/column names only; never answer bodies, emails or keys.
const remote = process.argv.includes("--remote");
const reportOnly = process.argv.includes("--report-only");
const queries = [
  "PRAGMA table_info(user_profiles)",
  `SELECT (SELECT COUNT(*) FROM "user") AS accounts,
    (SELECT COUNT(*) FROM user_profiles) AS player_profiles,
    (SELECT COUNT(*) FROM responses) AS answer_values,
    (SELECT COUNT(*) FROM questionnaire_sessions) AS questionnaire_sessions,
    (SELECT COUNT(*) FROM submissions WHERE status IN ('submitted','accepted','needs_revision')) AS submitted_cases,
    (SELECT COUNT(*) FROM uploads WHERE status IN ('uploaded','accepted')) AS private_uploads`,
  "PRAGMA table_info(submissions)",
  "PRAGMA table_info(questionnaire_sessions)",
  `SELECT COUNT(*) AS submissions_missing_answer_session FROM submissions s
     LEFT JOIN questionnaire_sessions qs ON qs.id = s.questionnaire_session_id
    WHERE s.questionnaire_session_id IS NOT NULL AND qs.id IS NULL`,
  "SELECT name FROM d1_migrations ORDER BY id",
  "PRAGMA table_info(questions)",
];
const results = [];
for (const query of queries) {
  const command = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", remote ? "--remote" : "--local", "--command", query, "--json"], {
    encoding: "utf8", env: { ...process.env, WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? "/private/tmp/chao-ngo-data-check.log" },
  });
  if (command.status !== 0) {
    const output = command.stdout + command.stderr;
    const reason = /SQLITE_AUTH|not authorized/i.test(output) ? "D1 rejected this SQL operation"
      : /Authentication error|403/i.test(output) ? "D1 authentication or permissions failed"
      : /no such table/i.test(output) ? "A required table is missing"
      : "D1 query failed";
    console.error(`Read-only game data check ${results.length + 1} failed: ${reason}; no data was changed.`);
    // Only SQL error lines from these fixed aggregate queries, never result bodies.
    for (const line of output.split("\n").filter(line => /D1_ERROR|SQLITE|\[ERROR\]|syntax error/i.test(line))) console.error(line);
    process.exit(1);
  }
  try { results.push(JSON.parse(command.stdout)); }
  catch { throw new Error("Unexpected D1 result format; no data was changed."); }
}
const rows = results.map(result => result.flatMap(item => item.results ?? []));
if (reportOnly) {
  console.log(JSON.stringify({ environment: remote ? "production" : "local", profileColumns: rows[0].map(row => row.name), counts: rows[1], submissionColumns: rows[2].map(row => row.name), questionnaireSessionColumns: rows[3].map(row => row.name), integrity: rows[4], appliedMigrations: rows[5].map(row => row.name), questionColumns: rows[6].map(row => row.name) }, null, 2));
  process.exit(0);
}
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
