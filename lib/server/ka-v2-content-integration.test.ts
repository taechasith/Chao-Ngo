import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterAll, beforeAll, expect, it } from "vitest";
import { unstable_splitSqlQuery } from "wrangler";
import content from "../content/ka-v2-player-assets.json";
import { env } from "./testing/cloudflare";
import { getPlayerTimeline } from "./content/player-evidence";

let mf: Miniflare;
async function apply(name: string) {
  const sql = unstable_splitSqlQuery(await readFile("migrations/" + name, "utf8"));
  await env.DB.batch(sql.map(statement => env.DB.prepare(statement)));
}
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {}", compatibilityDate: "2026-09-19", d1Databases: ["DB"] }));
  env.DB = await mf.getD1Database("DB") as unknown as D1Database;
  for (const name of (await readdir("migrations")).filter(name => name.endsWith(".sql") && name < "0017").sort()) await apply(name);
  await env.DB.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)')
    .bind("v2-test", "QA", "v2@example.test", 1, 0, 0).run();
  await env.DB.prepare("INSERT INTO user_profiles (user_id,age,education_level,personal_skills_json) VALUES ('v2-test',24,'bachelor','[\"QA\"]')").run();
  await env.DB.prepare("INSERT INTO questionnaire_sessions (id,user_id,questionnaire_id) VALUES ('v2-session','v2-test','questionnaire-submission-ka-maimee-netlood-city-v1')").run();
  await env.DB.prepare("INSERT INTO responses (id,session_id,question_id,value_json) VALUES ('v2-answer','v2-session','question-submission-ka-maimee-model','\"Saved before V2\"')").run();
  await env.DB.prepare("INSERT INTO submissions (id,user_id,subgame_id,questionnaire_session_id,status) VALUES ('v2-submission','v2-test','subgame-ka-fintech','v2-session','submitted')").run();
  await env.DB.prepare("INSERT INTO uploads (id,submission_id,user_id,kind,private_r2_key,original_name,stored_name,bytes,mime_declared,status) VALUES ('v2-upload','v2-submission','v2-test','answer_attachment','qa/v2.txt','qa.txt','qa.txt',4,'text/plain','uploaded')").run();
  for (const [id, node] of [["legacy-maimee", "maimee"], ["legacy-wave", "wa-ve"], ["legacy-personnel", "personnel"], ["asset-ka-netlood-story", "netlood-city"], ["asset-ka-netlood-brief", "netlood-city"]]) {
    await env.DB.prepare("INSERT INTO assets (id,timeline_node_id,title,kind,r2_key,player_visible,sort_order,checksum,metadata_json) VALUES (?,?,?,'text',?,1,0,'legacy','{}')")
      .bind(id, "timeline-ka-" + node, id, "games/ka-casefiles/" + node + "/" + id + ".txt").run();
  }
}, 30_000);
afterAll(async () => { await mf?.dispose(); });

it("switches the published catalog, preserves saved data and instruments, and can safely replay", async () => {
  const preserved = ["user_profiles", "questionnaire_sessions", "responses", "submissions", "uploads", "questions", "subgames"];
  const snapshot = async () => Promise.all(preserved.map(async table => (await env.DB.prepare("SELECT * FROM " + table + " ORDER BY 1").all()).results));
  const before = await snapshot();
  await apply("0017_ka_casefiles_v2.sql");
  await apply("0017_ka_casefiles_v2.sql");
  expect(await snapshot()).toEqual(before);
  const legacy = await env.DB.prepare("SELECT player_visible FROM assets WHERE id = 'legacy-maimee'").first();
  expect(legacy).toMatchObject({ player_visible: 0 });
  const timeline = await getPlayerTimeline({ gameSlug: "ka-casefiles", r2KeyPrefix: "games/ka-casefiles/" });
  expect(timeline?.find(node => node.slug === "maimee")?.files).toHaveLength(22);
  expect(timeline?.find(node => node.slug === "wa-ve")?.files).toHaveLength(15);
  expect(timeline?.find(node => node.slug === "personnel")?.files).toHaveLength(1);
  const published = timeline?.flatMap(node => node.files) ?? [];
  expect(published.some(file => file.id === "asset-ka-netlood-story")).toBe(false);
  expect(published.filter(file => file.id.startsWith("asset-ka-v2-")).map(file => file.url).sort()).toEqual(content.assets.map(asset => asset.url).sort());
});

it("ships only the 38 allowlisted player originals with byte-identical files", async () => {
  expect(content.assets).toHaveLength(38);
  const actualFiles: string[] = [];
  async function walk(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(path + "/" + entry.name);
      else actualFiles.push(path + "/" + entry.name);
    }
  }
  await walk("public/ka-casefiles/v2");
  expect(actualFiles.sort()).toEqual(content.assets.map(asset => "public" + asset.localUrl).sort());
  for (const asset of content.assets) {
    const bytes = await readFile("public" + asset.localUrl);
    expect(bytes.length).toBe(asset.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.checksum);
    expect(asset.sourcePath).not.toMatch(/ผู้ร้ายตัวจริง|หลักฐานที่บอกว่ามีฆาตกร/);
  }
});
