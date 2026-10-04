import { describe, expect, it } from "vitest";
import { isD1Overload, withD1OverloadHandling } from "./d1-overload";

describe("D1 overload response", () => {
  it("recognizes the wrapped D1 queue error but never masks other failures", async () => {
    const overload = new Error("query failed", { cause: new Error("D1_ERROR: D1 DB is overloaded. Requests queued for too long.") });
    expect(isD1Overload(overload)).toBe(true);
    const reply = await withD1OverloadHandling(async () => { throw overload; })();
    expect(reply.status).toBe(503);
    expect(reply.headers.get("Retry-After")).toBe("2");
    expect(reply.headers.get("Cache-Control")).toBe("no-store");
    expect(await reply.json()).toEqual({ code: "DATABASE_BUSY" });
    const schemaError = new Error("D1_ERROR: no such table: responses");
    expect(isD1Overload(schemaError)).toBe(false);
    await expect(withD1OverloadHandling(async () => { throw schemaError; })()).rejects.toBe(schemaError);
  });
});
