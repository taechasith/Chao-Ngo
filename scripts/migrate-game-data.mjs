import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";
import console from "node:console";

const reviewed = ["0014_research_profile_skills.sql", "0015_submission_reviews.sql", "0016_submission_lookup_index.sql", "0017_ka_casefiles_v2.sql", "0018_ka_submission_v2.sql", "0019_ka_ai_pdf.sql", "0020_live_question_updates.sql", "0021_submission_ai_preparation.sql"];
function query(sql) {
  const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--remote", "--command", sql, "--json"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("Production D1 preflight query failed; stop without applying migrations.");
  return JSON.parse(result.stdout).flatMap(batch => batch.results ?? []);
}
const applied = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
const pending = readdirSync("migrations").filter(name => name.endsWith(".sql") && !applied.has(name));
if (pending.some(name => !reviewed.includes(name))) throw new Error("Unexpected pending migration; review the ledger before changing production.");
for (const [table, column, migration] of [
  ["submissions", "additional_ai_links_json", "0021_submission_ai_preparation.sql"],
  ["submissions", "ai_companion_confirmed_at", "0021_submission_ai_preparation.sql"],
  ["user_profiles", "personal_skills_json", reviewed[0]],
  ["submissions", "reviewer_note", reviewed[1]],
  ["submissions", "revision_of_submission_id", reviewed[1]],
  ["questionnaire_sessions", "closed_at", reviewed[1]],
]) {
  const exists = query(`PRAGMA table_info(${table})`).some(row => row.name === column);
  if (exists !== applied.has(migration)) throw new Error("Schema and migration ledger disagree; stop to avoid replaying an ALTER TABLE.");
}
const countsSql = `SELECT (SELECT COUNT(*) FROM responses) AS answers,
  (SELECT COUNT(*) FROM user_profiles) AS profiles,
  (SELECT COUNT(*) FROM submissions) AS submissions,
  (SELECT COUNT(*) FROM uploads) AS uploads`;
const before = query(countsSql);
console.log(JSON.stringify({ pendingReviewedMigrations: pending, preservedRecordCountsBefore: before }));
if (pending.includes("0017_ka_casefiles_v2.sql")) {
  console.log(JSON.stringify({ previousKaAssetVisibility: query("SELECT id, player_visible FROM assets WHERE timeline_node_id IN ('timeline-ka-netlood-city','timeline-ka-personnel','timeline-ka-maimee','timeline-ka-wa-ve') ORDER BY id") }));
  const assetsCheck = spawnSync(process.execPath, ["scripts/ka-v2-assets.mjs", "--verify-remote"], { stdio: "inherit" });
  if (assetsCheck.status !== 0) throw new Error("V2 CDN assets are missing or differ from the approved originals; do not switch player content.");
}
if (pending.length) {
  const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "migrations", "apply", "DB", "--remote"], { stdio: ["pipe", "inherit", "inherit"], input: "y\n" });
  if (result.status !== 0) throw new Error("Migration failed; inspect the ledger before retrying.");
}
const after = query(countsSql);
if (Object.keys(before[0]).some(key => after[0][key] < before[0][key])) throw new Error("Record counts decreased during rollout; investigate before deploying.");
console.log(JSON.stringify({ preservedRecordCountsAfter: after }));
const check = spawnSync(process.execPath, ["scripts/check-game-data.mjs", "--remote"], { stdio: "inherit" });
if (check.status !== 0) process.exit(1);
