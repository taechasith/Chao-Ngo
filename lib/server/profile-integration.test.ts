import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { env } from "./testing/cloudflare";
import { GET as profile, PATCH as update } from "../../app/api/player-profile/route";
import { GET as avatar } from "../../app/api/player-profile/avatar/route";
import { maximumAvatarBytes } from "./profile-validation";

vi.mock("./auth", () => ({
  getAuthReadinessForRuntime: () => ({ isReady: true }),
  getAuth: () => ({ api: { getSession: async ({ headers }: { headers: Headers }) => {
    const id = headers.get("x-test-user");
    return id ? { user: { id } } : null;
  } } }),
}));

let mf: Miniflare;
const owner = "profile-owner";
const stranger = "profile-stranger";
const request = (body?: unknown, id: string | null = owner, origin = "https://example.test", path = "/api/player-profile") => new Request(`https://example.test${path}`, {
  method: body === undefined ? "GET" : "PATCH",
  headers: { Origin: origin, ...(id ? { "x-test-user": id } : {}), "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=";

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {}", compatibilityDate: "2026-09-19", d1Databases: ["DB"], r2Buckets: ["PRIVATE_UPLOADS"] }));
  env.DB = await mf.getD1Database("DB") as unknown as D1Database;
  env.PRIVATE_UPLOADS = await mf.getR2Bucket("PRIVATE_UPLOADS") as unknown as R2Bucket;
  await env.DB.prepare('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT, image TEXT, createdAt INTEGER, updatedAt INTEGER)').run();
  for (const id of [owner, stranger]) await env.DB.prepare('INSERT INTO "user" VALUES (?, ?, ?, NULL, 0, 0)').bind(id, "Original", `${id}@example.test`).run();
}, 30000);
afterAll(async () => { await mf?.dispose(); });

describe("own profile and private avatar", () => {
  it("requires authentication and same-origin writes", async () => {
    expect((await profile(request(undefined, null))).status).toBe(401);
    expect((await update(request({ name: "Changed" }, null))).status).toBe(401);
    expect((await update(request({ name: "Changed" }, owner, "https://other.test"))).status).toBe(403);
  });
  it("accepts only display name and a bounded raster avatar", async () => {
    for (const body of [{ name: " " }, { name: "a".repeat(81) }, { name: "Valid", userId: stranger }, { name: "Valid", age: 22 }, { name: "Valid", image: "data:image/svg+xml;base64,PHN2Zz4=" }, { name: "Valid", image: "data:image/png;base64," + Buffer.alloc(maximumAvatarBytes + 1).toString("base64") }]) {
      expect((await update(request(body))).status).toBe(400);
    }
    expect((await update(request({ name: "x".repeat(140001) }))).status).toBe(413);
  });
  it("stores bytes in private R2 and only an authenticated URL in D1", async () => {
    const saved = await update(request({ name: "  นักสืบ  ", image }));
    expect(saved.status).toBe(200);
    const { user } = await saved.json() as { user: { name: string; image: string } };
    expect(user.name).toBe("นักสืบ");
    expect(user.image).toMatch(/^\/api\/player-profile\/avatar\?v=/);
    expect((await env.PRIVATE_UPLOADS.list()).objects).toHaveLength(1);
    const response = await avatar(request(undefined, owner, undefined, user.image));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(12);
    expect((await avatar(request(undefined, null, undefined, user.image))).status).toBe(401);
    expect((await avatar(request(undefined, stranger, undefined, user.image))).status).toBe(404);
    expect((await update(request({ name: "New name" }))).status).toBe(200);
    expect((await avatar(request(undefined, owner, undefined, user.image))).status).toBe(200);
    const other = await (await profile(request(undefined, stranger))).json() as { user: { name: string; image: string | null } };
    expect(other.user).toMatchObject({ name: "Original", image: null });
    expect((await update(request({ name: "New name", image: null }))).status).toBe(200);
    expect((await avatar(request(undefined, owner, undefined, user.image))).status).toBe(404);
    expect((await env.PRIVATE_UPLOADS.list()).objects).toHaveLength(0);
  });
});
