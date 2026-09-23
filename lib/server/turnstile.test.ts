import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyTurnstileToken } from "./turnstile";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Turnstile verification", () => {
  it("leaves local auth available when no secret is configured", async () => {
    await expect(verifyTurnstileToken({ token: "ignored" })).resolves.toEqual({ configured: false, ok: true });
  });

  it("rejects missing or oversized tokens without calling Cloudflare", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(verifyTurnstileToken({ secret: "secret", token: "" })).resolves.toEqual({ configured: true, ok: false, reason: "invalid" });
    await expect(verifyTurnstileToken({ secret: "secret", token: "x".repeat(2049) })).resolves.toEqual({ configured: true, ok: false, reason: "invalid" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the token to Cloudflare and accepts a successful response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ action: "signup", success: true }), { status: 200 }));

    await expect(verifyTurnstileToken({ expectedAction: "signup", remoteIp: "203.0.113.10", secret: "secret", token: "token" })).resolves.toEqual({ configured: true, ok: true });

    const request = fetchSpy.mock.calls[0]?.[1];
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({ remoteip: "203.0.113.10", response: "token", secret: "secret" });
  });

  it("fails closed when Cloudflare is unavailable or rejects the token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("upstream failure", { status: 503 }));
    await expect(verifyTurnstileToken({ secret: "secret", token: "token" })).resolves.toEqual({ configured: true, ok: false, reason: "unavailable" });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 200 }));
    await expect(verifyTurnstileToken({ secret: "secret", token: "token" })).resolves.toEqual({ configured: true, ok: false, reason: "invalid" });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ action: "signup", success: true }), { status: 200 }));
    await expect(verifyTurnstileToken({ expectedAction: "login", secret: "secret", token: "token" })).resolves.toEqual({ configured: true, ok: false, reason: "invalid" });
  });
});
