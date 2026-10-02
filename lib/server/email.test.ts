import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "./testing/cloudflare";
import { sendTransactionalEmail } from "./email";

const bindings = env as CloudflareEnv & { RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string };
const message = { html: "<a href='https://example.test/verify?token=private-token'>Verify</a>", text: "Private message", subject: "Verify", to: "private@example.test" };

beforeEach(() => {
  bindings.RESEND_API_KEY = "re_private-test-key";
  bindings.RESEND_FROM_EMAIL = "Chao Ngo <noreply@example.test>";
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("transactional email diagnostics", () => {
  it.each([
    [403, "validation_error", "The example.test domain is not verified. Please, add and verify your domain.", "sender_domain_not_verified"],
    [403, "validation_error", "You can only send testing emails to your own email address (private@example.test).", "testing_recipient_restriction"],
    [401, "validation_error", "API key is invalid", "invalid_api_key"],
    [403, "invalid_permission", "Access token is missing required scopes.", "api_key_restricted"],
    [429, "daily_quota_exceeded", "You have exceeded your daily email sending quota.", "sending_quota_exceeded"],
    [503, "service_unavailable", "Temporarily unavailable", "provider_unavailable"],
  ])("identifies provider failure %s/%s without retaining its message", async (status, name, providerMessage, reason) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ name, message: `${providerMessage} re_private-test-key https://example.test/verify?token=private-token`, recipient: message.to }, { status }));
    await expect(sendTransactionalEmail(message)).rejects.toThrow(reason);
    expect(console.error).toHaveBeenCalledOnce();
    const log = String(vi.mocked(console.error).mock.calls[0]?.[0]);
    expect(JSON.parse(log)).toEqual({ event: "transactional_email_delivery_failed", status, resendError: name, reason, responseFormat: "json" });
    for (const sensitive of [message.to, "private-token", bindings.RESEND_API_KEY, providerMessage]) expect(log).not.toContain(sensitive);
  });

  it("does not echo unexpected error names or non-JSON provider responses", async () => {
    const send = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ name: "re_private-test-key", message: "private@example.test" }, { status: 403 }));
    await expect(sendTransactionalEmail(message)).rejects.toThrow("unknown / provider_rejected");
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).not.toContain("re_private-test-key");
    send.mockResolvedValueOnce(new Response("<html>private-token</html>", { status: 502 }));
    await expect(sendTransactionalEmail(message)).rejects.toThrow("provider_unavailable");
    expect(String(vi.mocked(console.error).mock.calls[1]?.[0])).not.toContain("private-token");
  });

  it("sanitizes transport failures and does not retry a verification email", async () => {
    const send = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("private@example.test re_private-test-key private-token"));
    await expect(sendTransactionalEmail(message)).rejects.toThrow("network_error");
    expect(send).toHaveBeenCalledOnce();
    expect(JSON.parse(String(vi.mocked(console.error).mock.calls[0]?.[0]))).toMatchObject({ status: null, reason: "network_error" });
  });

  it.each([
    [JSON.stringify({ error: "Not authorized to send emails from example.test", statusCode: 403 }), "sender_domain_not_allowed", "json"],
    [JSON.stringify({ error: { message: "The example.test domain is not verified", name: "validation_error" } }), "sender_domain_not_verified", "json"],
    ["<html><h1>Access denied</h1>Error code: 1010 private@example.test private-token</html>", "upstream_firewall_1010", "html"],
    ["error code: 1020 private-token", "upstream_firewall_1020", "text"],
  ])("classifies alternate provider responses without exposing response text", async (raw, reason, responseFormat) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(raw, { status: 403 }));
    await expect(sendTransactionalEmail(message)).rejects.toThrow(reason);
    const log = String(vi.mocked(console.error).mock.calls[0]?.[0]);
    expect(JSON.parse(log)).toMatchObject({ reason, responseFormat });
    expect(log).not.toContain("private-token");
    expect(log).not.toContain("example.test");
  });

  it("fails before making a request when runtime configuration is missing", async () => {
    delete bindings.RESEND_API_KEY;
    const send = vi.spyOn(globalThis, "fetch");
    await expect(sendTransactionalEmail(message)).rejects.toThrow("not_configured");
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps successful sending unchanged and logs no message content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ id: "test-email-id" }));
    await expect(sendTransactionalEmail(message)).resolves.toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
  });
});
