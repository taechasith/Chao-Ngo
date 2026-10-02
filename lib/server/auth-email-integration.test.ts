import { readFile } from "node:fs/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { POST } from "../../app/api/auth/[...all]/route";
import { env } from "./testing/cloudflare";

const bindings = env as CloudflareEnv & {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};
let mf: Miniflare;

const request = (email = "unverified@example.test") => new Request("https://example.test/api/auth/send-verification-email", {
  method: "POST",
  headers: { Origin: "https://example.test", "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.10" },
  body: JSON.stringify({ email, callbackURL: "/onboarding" }),
});

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {}", compatibilityDate: "2026-09-19", d1Databases: ["DB"] }));
  bindings.DB = await mf.getD1Database("DB") as unknown as D1Database;
  await bindings.DB.prepare("CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)").run();
  const migration = await readFile(new URL("../../migrations/0002_auth_and_research.sql", import.meta.url), "utf8");
  for (const statement of migration.split(";").filter((sql) => sql.trim())) await bindings.DB.prepare(statement).run();
  await bindings.DB.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)')
    .bind("email-test-user", "Email test", "unverified@example.test", Date.now(), Date.now()).run();
  bindings.BETTER_AUTH_SECRET = "test-only-auth-secret-with-at-least-32-characters";
  bindings.BETTER_AUTH_URL = "https://example.test";
  bindings.RESEND_API_KEY = "test-only-resend-key";
  bindings.RESEND_FROM_EMAIL = "Chao Ngo <noreply@example.test>";
}, 30000);

afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await mf?.dispose(); });

describe("verification email through the real auth handler and D1", () => {
  it("sends a verification link with the requested onboarding destination", async () => {
    const originalFetch = globalThis.fetch;
    const send = vi.spyOn(globalThis, "fetch").mockImplementation((input, options) => {
      if (String(input) === "https://api.resend.com/emails") return Promise.resolve(Response.json({ id: "test-email" }));
      return originalFetch(input, options);
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
    const call = send.mock.calls.find(([input]) => String(input) === "https://api.resend.com/emails");
    expect(call).toBeDefined();
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.to).toEqual(["unverified@example.test"]);
    expect(body.from).toBe("Chao Ngo <noreply@example.test>");
    expect(body.text).toContain("https://example.test/api/auth/verify-email?token=");
    expect(body.text).toContain("callbackURL=%2Fonboarding");
  });

  it("does not send a verification email for an unknown account", async () => {
    const send = vi.spyOn(globalThis, "fetch");
    const response = await POST(request("unknown@example.test"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
    expect(send.mock.calls.filter(([input]) => String(input) === "https://api.resend.com/emails")).toHaveLength(0);
  });
});
