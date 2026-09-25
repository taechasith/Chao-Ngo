import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { env } from "./testing/cloudflare";
import { GET, PATCH } from "../../app/api/player-research-profile/route";

vi.mock("./research-access", () => ({
  requireResearchParticipant: async (request: Request) => {
    const id = request.headers.get("x-test-user");
    return id ? { userId: id, minimumParticipantAge: 18 } : Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  },
}));

let mf: Miniflare;
const owner = "research-owner";
const other = "research-other";
const initialFields = { quantum: 3, space: 4, psychology: 2, fintech: 1, biotech: 5 };
const payload = {
  age: 27,
  educationLevel: "bachelor",
  gender: null,
  institution: null,
  scienceInterest: 4,
  fieldInterests: initialFields,
  personalSkills: ["วิเคราะห์ข้อมูล", "การสื่อสาร"],
};
const request = (id: string | null, body?: unknown, origin = "https://example.test") => new Request("https://example.test/api/player-research-profile", {
  method: body === undefined ? "GET" : "PATCH",
  headers: { Origin: origin, ...(id ? { "x-test-user": id } : {}), "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {}", compatibilityDate: "2026-09-19", d1Databases: ["DB"] }));
  env.DB = await mf.getD1Database("DB") as unknown as D1Database;
  await env.DB.prepare("CREATE TABLE user_profiles (user_id TEXT PRIMARY KEY, age INTEGER, education_level TEXT, gender TEXT, institution TEXT, science_interest INTEGER, science_fields_interest_json TEXT, personal_skills_json TEXT, updated_at TEXT)").run();
  await env.DB.prepare("CREATE TABLE player_rate_limits (rate_key TEXT PRIMARY KEY, request_count INTEGER NOT NULL, window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  for (const id of [owner, other]) await env.DB.prepare("INSERT INTO user_profiles VALUES (?, 24, 'upper_secondary', NULL, NULL, 3, ?, '[]', CURRENT_TIMESTAMP)").bind(id, JSON.stringify(initialFields)).run();
}, 30000);
afterAll(async () => { await mf?.dispose(); });

describe("participant research profile", () => {
  it("limits reads and writes to the authenticated participant", async () => {
    expect((await GET(request(null))).status).toBe(401);
    expect((await PATCH(request(null, payload))).status).toBe(401);
    expect((await PATCH(request(owner, payload, "https://other.test"))).status).toBe(403);
    expect((await GET(request("missing"))).status).toBe(409);
    expect((await PATCH(request("missing", payload))).status).toBe(409);
  });

  it("validates age, ratings, skill bounds and unexpected fields", async () => {
    for (const body of [
      { ...payload, age: 17 },
      { ...payload, scienceInterest: 6 },
      { ...payload, fieldInterests: { ...initialFields, quantum: 0 } },
      { ...payload, personalSkills: ["same", "Same"] },
      { ...payload, personalSkills: ["x".repeat(41)] },
      { ...payload, personalSkills: Array.from({ length: 9 }, (_, index) => `skill ${index}`) },
      { ...payload, userId: other },
    ]) expect((await PATCH(request(owner, body))).status).toBe(400);
  });

  it("updates current research data without changing another participant", async () => {
    const saved = await PATCH(request(owner, payload));
    expect(saved.status).toBe(200);
    expect((await saved.json() as { profile: typeof payload }).profile).toMatchObject(payload);
    const own = await GET(request(owner));
    expect((await own.json() as { profile: typeof payload }).profile).toMatchObject(payload);
    const unrelated = await GET(request(other));
    expect((await unrelated.json() as { profile: typeof payload }).profile).toMatchObject({ age: 24, personalSkills: [] });
  });
});
