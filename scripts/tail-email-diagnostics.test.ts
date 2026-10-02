import { describe, expect, it } from "vitest";
// @ts-expect-error The standalone CI tool is a JavaScript module.
import { createEventReader, sanitizeEmailFailure } from "./tail-email-diagnostics.mjs";

describe("production email log filtering", () => {
  it("frames split JSON events without forwarding request data", () => {
    const events: unknown[] = [];
    const read = createEventReader((event: unknown) => events.push(event));
    const event = { logs: [{ message: ['{"event":"transactional_email_delivery_failed","reason":"invalid_api_key","status":401,"resendError":"validation_error"}'] }], request: { url: "https://example.test/{private-token}" } };
    const text = JSON.stringify(event, null, 4);
    read(text.slice(0, 90));
    read(text.slice(90) + "\n" + text);
    expect(events).toEqual([event, event]);
  });
  it("only retains allowlisted fields and values", () => {
    expect(sanitizeEmailFailure({ event: "transactional_email_delivery_failed", reason: "invalid_api_key", status: 401, resendError: "validation_error", token: "private-token", to: "private@example.test" })).toEqual({ event: "transactional_email_delivery_failed", reason: "invalid_api_key", status: 401, resendError: "validation_error" });
    expect(sanitizeEmailFailure({ event: "transactional_email_delivery_failed", reason: "private-token" })).toBeNull();
    expect(sanitizeEmailFailure({ event: "transactional_email_delivery_failed", reason: "network_error", status: "private-token", resendError: "private@example.test" })).toEqual({ event: "transactional_email_delivery_failed", reason: "network_error", status: null, resendError: null });
  });
});
