import { readFile } from "node:fs/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { generateKeyPair, SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../../app/api/auth/[...all]/route";
import { env } from "./testing/cloudflare";

const origin = "https://example.test";
const clientId = "google-test.apps.googleusercontent.com";
const bindings = env as CloudflareEnv & { BETTER_AUTH_URL?: string; BETTER_AUTH_SECRET?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; TURNSTILE_SECRET_KEY?: string };
let mf: Miniflare;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
const post = (path: string, body: unknown, requestOrigin = origin) => new Request(`${origin}/api/auth${path}`, { method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.10" }, body: JSON.stringify(body) });
const cookies = (response: Response) => response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");

async function begin(extra = {}) {
  const response = await POST(post("/sign-in/social", { provider: "google", disableRedirect: true, callbackURL: "/play/node-zone/quantum", newUserCallbackURL: "/onboarding", errorCallbackURL: "/login?next=%2Fplay", ...extra }));
  expect(response.status).toBe(200);
  const body = await response.json() as { url: string };
  return { url: new URL(body.url), cookie: cookies(response) };
}

async function complete(email: string, verified = true) {
  const flow = await begin();
  const idToken = await new SignJWT({ email, email_verified: verified, name: "Google name", picture: "https://lh3.googleusercontent.com/test-avatar" }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer("https://accounts.google.com").setAudience(clientId).setSubject(`google-${email}`).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const send = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== "https://oauth2.googleapis.com/token") throw new Error("Unexpected external request in Google auth test");
    const body = new URLSearchParams(String(options?.body));
    expect(body.get("redirect_uri")).toBe(`${origin}/api/auth/callback/google`);
    expect(body.get("code_verifier")?.length).toBeGreaterThan(40);
    return Response.json({ access_token: "test-only-access-token", id_token: idToken, expires_in: 3600, token_type: "Bearer", scope: "openid email profile" });
  });
  const response = await GET(new Request(`${origin}/api/auth/callback/google?state=${encodeURIComponent(flow.url.searchParams.get("state")!)}&code=test-only-code`, { headers: { Cookie: flow.cookie } }));
  expect(send).toHaveBeenCalledOnce();
  return response;
}

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {}", compatibilityDate: "2026-09-19", d1Databases: ["DB"] }));
  bindings.DB = await mf.getD1Database("DB") as unknown as D1Database;
  await bindings.DB.prepare("CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)").run();
  const migration = await readFile(new URL("../../migrations/0002_auth_and_research.sql", import.meta.url), "utf8");
  for (const statement of migration.split(";").filter(sql => sql.trim())) await bindings.DB.prepare(statement).run();
  privateKey = (await generateKeyPair("RS256")).privateKey;
}, 30000);

beforeEach(async () => {
  bindings.BETTER_AUTH_SECRET = "test-only-auth-secret-with-at-least-32-characters";
  bindings.BETTER_AUTH_URL = origin;
  bindings.GOOGLE_CLIENT_ID = clientId;
  bindings.GOOGLE_CLIENT_SECRET = "test-only-google-secret";
  delete bindings.TURNSTILE_SECRET_KEY;
  await bindings.DB.prepare("DELETE FROM rateLimit").run();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await mf?.dispose(); });

describe("Google-only authentication through the real handler and D1", () => {
  it("starts the Google code flow with PKCE, a signed state cookie and basic scopes only", async () => {
    const flow = await begin();
    expect(flow.url.origin).toBe("https://accounts.google.com");
    expect(flow.url.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback/google`);
    expect(flow.url.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
    expect(flow.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(flow.url.searchParams.get("state")?.length).toBeGreaterThan(20);
    expect(flow.cookie).toContain("state=");
    expect(flow.url.searchParams.get("access_type")).toBe("online");
    expect(flow.url.searchParams.get("include_granted_scopes")).toBeNull();
    expect(flow.url.searchParams.get("prompt")).toBe("select_account");
  });

  it("creates a verified player without email delivery and sends new players to onboarding", async () => {
    const response = await complete("new-google@example.test");
    expect(response.headers.get("Location")).toBe("/onboarding");
    const session = await GET(new Request(`${origin}/api/auth/get-session`, { headers: { Cookie: cookies(response) } }));
    const body = await session.json() as { user: { id: string; email: string; emailVerified: boolean } };
    expect(body.user.email).toBe("new-google@example.test");
    expect(body.user.emailVerified).toBe(true);
    const account = await bindings.DB.prepare("SELECT accessToken, refreshToken FROM account WHERE userId = ?").bind(body.user.id).first<{ accessToken: string; refreshToken: string | null }>();
    expect(account?.accessToken).toBeTruthy();
    expect(account?.accessToken).not.toContain("test-only-access-token");
    expect(account?.refreshToken).toBeNull();
  });

  it("links an unverified legacy player after Google proves ownership, keeping profile and revoking old sessions", async () => {
    await bindings.DB.prepare('INSERT INTO "user" (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?, ?)').bind("legacy-player", "Custom name", "legacy@example.test", "/custom-avatar.jpg", Date.now(), Date.now()).run();
    await bindings.DB.prepare("INSERT INTO user_profiles (user_id, age) VALUES (?, ?)").bind("legacy-player", 25).run();
    await bindings.DB.prepare("INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)").bind("old-session", "old-session-token", "legacy-player", Date.now() + 3600000, Date.now(), Date.now()).run();
    const response = await complete("legacy@example.test");
    expect(response.headers.get("Location")).toBe("/play/node-zone/quantum");
    expect(await bindings.DB.prepare('SELECT id, name, emailVerified, image FROM "user" WHERE email = ?').bind("legacy@example.test").first()).toMatchObject({ id: "legacy-player", name: "Custom name", emailVerified: 1, image: "/custom-avatar.jpg" });
    expect(await bindings.DB.prepare("SELECT age FROM user_profiles WHERE user_id = ?").bind("legacy-player").first()).toEqual({ age: 25 });
    expect(await bindings.DB.prepare("SELECT userId FROM account WHERE providerId = 'google' AND userId = ?").bind("legacy-player").first()).toEqual({ userId: "legacy-player" });
    expect(await bindings.DB.prepare("SELECT id FROM session WHERE id = 'old-session'").first()).toBeNull();
    const session = await GET(new Request(`${origin}/api/auth/get-session`, { headers: { Cookie: cookies(response) } }));
    expect((await session.json() as { user: { id: string; emailVerified: boolean } }).user).toMatchObject({ id: "legacy-player", emailVerified: true });
    expect(await bindings.DB.prepare("SELECT id FROM consent_records WHERE user_id = ?").bind("legacy-player").first()).toBeNull();
  });

  it("rejects an unverified Google claim without migrating or creating a player", async () => {
    const response = await complete("not-verified@example.test", false);
    expect(response.headers.get("Location")).toContain("error=google_email_not_verified");
    expect(await bindings.DB.prepare('SELECT id FROM "user" WHERE email = ?').bind("not-verified@example.test").first()).toBeNull();
    expect(response.headers.get("Set-Cookie")).not.toContain("session_token=");
  });

  it("does not verify or revoke sessions for a legacy player from an unverified Google claim", async () => {
    await bindings.DB.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)').bind("unverified-legacy", "Original", "unverified-legacy@example.test", Date.now(), Date.now()).run();
    await bindings.DB.prepare("INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)").bind("unverified-session", "unverified-session-token", "unverified-legacy", Date.now() + 3600000, Date.now(), Date.now()).run();
    const response = await complete("unverified-legacy@example.test", false);
    expect(response.headers.get("Location")).toContain("error=account_not_linked");
    expect(await bindings.DB.prepare('SELECT emailVerified FROM "user" WHERE id = ?').bind("unverified-legacy").first()).toEqual({ emailVerified: 0 });
    expect(await bindings.DB.prepare("SELECT id FROM session WHERE id = ?").bind("unverified-session").first()).toEqual({ id: "unverified-session" });
    expect(await bindings.DB.prepare("SELECT id FROM account WHERE userId = ?").bind("unverified-legacy").first()).toBeNull();
  });

  it("reuses a verified Google player on repeat sign-in without replacing their display name", async () => {
    const first = await complete("returning-google@example.test");
    const original = await bindings.DB.prepare('SELECT id FROM "user" WHERE email = ?').bind("returning-google@example.test").first<{ id: string }>();
    expect(first.headers.get("Location")).toBe("/onboarding");
    await bindings.DB.prepare('UPDATE "user" SET name = ? WHERE id = ?').bind("My own display name", original!.id).run();
    vi.restoreAllMocks();
    const second = await complete("returning-google@example.test");
    expect(second.headers.get("Location")).toBe("/play/node-zone/quantum");
    expect(await bindings.DB.prepare('SELECT id, name FROM "user" WHERE email = ?').bind("returning-google@example.test").all()).toMatchObject({ results: [{ id: original!.id, name: "My own display name" }] });
  });

  it("rejects reuse of consumed state without another token exchange", async () => {
    const flow = await begin();
    const request = () => new Request(`${origin}/api/auth/callback/google?state=${flow.url.searchParams.get("state")}&error=access_denied`, { headers: { Cookie: flow.cookie } });
    await GET(request());
    const send = vi.spyOn(globalThis, "fetch");
    const response = await GET(request());
    expect(response.headers.get("Location")).toContain("error=state_mismatch");
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a callback without the matching browser state before token exchange", async () => {
    const flow = await begin();
    const send = vi.spyOn(globalThis, "fetch");
    const response = await GET(new Request(`${origin}/api/auth/callback/google?state=${flow.url.searchParams.get("state")}&code=test-only-code`));
    expect(response.headers.get("Location")).toContain("error=state_mismatch");
    expect(send).not.toHaveBeenCalled();
  });

  it("returns cancellation to login with its local destination", async () => {
    const flow = await begin();
    const response = await GET(new Request(`${origin}/api/auth/callback/google?state=${flow.url.searchParams.get("state")}&error=access_denied`, { headers: { Cookie: flow.cookie } }));
    const location = new URL(response.headers.get("Location")!, origin);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/play");
    expect(location.searchParams.get("error")).toBe("access_denied");
  });

  it("rejects cross-origin initiation and external callback destinations", async () => {
    expect((await POST(post("/sign-in/social", { provider: "google", callbackURL: "/play" }, "https://attacker.test"))).status).toBe(403);
    expect((await POST(post("/sign-in/social", { provider: "google", callbackURL: "/play" }, "null"))).status).toBe(403);
    expect((await POST(post("/sign-in/social", { provider: "google", callbackURL: "https://attacker.test" }))).status).toBe(403);
    for (const field of ["newUserCallbackURL", "errorCallbackURL"]) {
      expect((await POST(post("/sign-in/social", { provider: "google", [field]: "//attacker.test" }))).status).toBe(403);
    }
  });

  it("disables legacy email verification links", async () => {
    expect((await GET(new Request(`${origin}/api/auth/verify-email?token=test-only-token`))).status).toBe(404);
  });

  it("requires Turnstile before starting OAuth when configured", async () => {
    bindings.TURNSTILE_SECRET_KEY = "test-only-turnstile-secret";
    const send = vi.spyOn(globalThis, "fetch");
    expect((await POST(post("/sign-in/social", { provider: "google", callbackURL: "/play" }))).status).toBe(403);
    expect(send).not.toHaveBeenCalled();
    send.mockResolvedValueOnce(Response.json({ success: true, hostname: "attacker.test", action: "login" }));
    expect((await POST(post("/sign-in/social", { provider: "google", turnstileToken: "test-token" }))).status).toBe(403);
    send.mockResolvedValueOnce(Response.json({ success: true, hostname: "example.test", action: "login" }));
    await begin({ turnstileToken: "test-token" });
  });

  it("fails closed before OAuth when credentials are missing", async () => {
    delete bindings.GOOGLE_CLIENT_SECRET;
    const response = await POST(post("/sign-in/social", { provider: "google" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "GOOGLE_AUTH_NOT_CONFIGURED" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each(["/sign-in/email", "/sign-up/email", "/request-password-reset", "/reset-password", "/send-verification-email", "/change-password", "/set-password"])("disables legacy endpoint %s", async path => {
    const send = vi.spyOn(globalThis, "fetch");
    expect((await POST(post(path, { email: "legacy@example.test", password: "test-only-password", token: "test-only-token" }))).status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([{ provider: "github" }, { provider: "google", idToken: { token: "test-token" } }, { provider: "google", scopes: ["https://www.googleapis.com/auth/drive"] }])("only accepts the supported Google code flow", async body => {
    expect((await POST(post("/sign-in/social", body))).status).toBe(400);
  });
});
