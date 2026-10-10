import { describe, expect, it, vi } from "vitest";
import { fetchWithDatabaseRetry } from "./database-retry.mjs";

const busy = () => Response.json({ code: "DATABASE_BUSY" }, { status: 503, headers: { "Retry-After": "2" } });
const sleep = async () => {};
describe("idempotent database retry", () => {
  it("resends the same AI draft after an explicit transient failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(busy()).mockResolvedValueOnce(Response.json({ ok: true }));
    const init = { method: "PATCH", body: '{"aiCompanionUsed":true}' };
    const response = await fetchWithDatabaseRetry("/api/submissions/draft/preparation", init, { fetcher, sleep });
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls).toEqual([["/api/submissions/draft/preparation", init], ["/api/submissions/draft/preparation", init]]);
  });
  it("stops after three retries and returns the final readable error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => busy());
    const response = await fetchWithDatabaseRetry("/api/player-research-profile", {}, { fetcher, sleep });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(await response.json()).toEqual({ code: "DATABASE_BUSY" });
  });
  it.each([401, 403, 409, 429, 500])("does not retry HTTP %s", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: "DATABASE_BUSY" }, { status }));
    await fetchWithDatabaseRetry("/api/player-research-profile", {}, { fetcher, sleep });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not retry other service errors or a lost network acknowledgement", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: "PRIVATE_STORAGE_UNAVAILABLE" }, { status: 503 }));
    await fetchWithDatabaseRetry("/api/submissions/draft/uploads/admission", { method: "POST", body: "{}" }, { fetcher, sleep });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const lost = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("connection lost"));
    await expect(fetchWithDatabaseRetry("/api/submissions/draft/preparation", { method: "PATCH", body: "{}" }, { fetcher: lost, sleep })).rejects.toThrow("connection lost");
    expect(lost).toHaveBeenCalledTimes(1);
  });
  it.each(["/api/submissions", "/api/submissions/draft/uploads", "/api/research-consent", "/api/auth/sign-in/social"])("does not replay %s", async path => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => busy());
    await fetchWithDatabaseRetry(path, { method: "POST", body: "{}" }, { fetcher, sleep });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
