import { describe, expect, it } from "vitest";
import { isD1Overload, isRetryableD1Error, withD1RetryableErrorHandling } from "./d1-overload";

describe("D1 overload response", () => {
  it("recognizes the wrapped D1 queue error but never masks other failures", async () => {
    const overload = new Error("query failed", { cause: new Error("D1_ERROR: D1 DB is overloaded. Requests queued for too long.") });
    expect(isD1Overload(overload)).toBe(true);
    const reply = await withD1RetryableErrorHandling(async () => { throw overload; })();
    expect(reply.status).toBe(503);
    expect(reply.headers.get("Retry-After")).toBe("2");
    expect(reply.headers.get("Cache-Control")).toBe("no-store");
    expect(await reply.json()).toEqual({ code: "DATABASE_BUSY" });
    const schemaError = new Error("D1_ERROR: no such table: responses");
    expect(isD1Overload(schemaError)).toBe(false);
    await expect(withD1RetryableErrorHandling(async () => { throw schemaError; })()).rejects.toBe(schemaError);
  });
  it("returns a retryable response for a lost D1 connection without masking unrelated failures", async () => {
    const lost = new Error("query failed", { cause: new Error("D1_ERROR: Network connection lost.") });
    expect(isRetryableD1Error(lost)).toBe(true);
    expect(isD1Overload(lost)).toBe(false);
    const reply = await withD1RetryableErrorHandling(async () => { throw lost; })();
    expect(reply.status).toBe(503);
    expect(await reply.json()).toEqual({ code: "DATABASE_BUSY" });
    expect(isRetryableD1Error(new Error("Network connection lost."))).toBe(false);
    expect(isRetryableD1Error(new Error("D1_ERROR: no such table: responses"))).toBe(false);
  });
});
