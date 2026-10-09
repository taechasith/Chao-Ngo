import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "./testing/cloudflare";
import { getResearchCollectionPolicy } from "./research-runtime";

afterEach(() => { vi.restoreAllMocks(); });

describe("public research configuration reads", () => {
  it("shares simultaneous reads but sees changes on the next request", async () => {
    let resolve!: (result: { results: { key: string; value: string }[] }) => void;
    const all = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; }))
      .mockResolvedValueOnce({ results: [{ key: "research_collection_enabled", value: "false" }] });
    env.DB = { prepare: () => ({ all }) } as unknown as D1Database;
    const pending = Array.from({ length: 12 }, () => getResearchCollectionPolicy());
    expect(all).toHaveBeenCalledTimes(1);
    resolve({ results: [{ key: "research_collection_enabled", value: "true" }] });
    expect((await Promise.all(pending)).every(policy => policy.enabled)).toBe(true);
    expect((await getResearchCollectionPolicy()).enabled).toBe(false);
    expect(all).toHaveBeenCalledTimes(2);
  });

  it("does not retain a failed read", async () => {
    const all = vi.fn().mockRejectedValueOnce(new Error("D1_ERROR: Database is overloaded"))
      .mockResolvedValueOnce({ results: [{ key: "research_collection_enabled", value: "true" }] });
    env.DB = { prepare: () => ({ all }) } as unknown as D1Database;
    await expect(getResearchCollectionPolicy()).rejects.toThrow("overloaded");
    expect((await getResearchCollectionPolicy()).enabled).toBe(true);
    expect(all).toHaveBeenCalledTimes(2);
  });
});
