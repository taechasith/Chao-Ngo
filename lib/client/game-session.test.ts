import { describe, expect, it, vi, afterEach } from "vitest";
import { startGameSession, recordGameActivity } from "./game-session";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("evidence progress waits for the owned game session", () => {
  it("queues an immediate evidence open behind the start request and shares that request", async () => {
    const store = new Map();
    vi.stubGlobal("window", { sessionStorage: { getItem: (key: string) => store.get(key), setItem: (key: string, value: string) => store.set(key, value) } });
    let resolveStart!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveStart = resolve; })).mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const start = startGameSession("game", "case");
    expect(startGameSession("game", "case")).toBe(start);
    const evidence = recordGameActivity("game", "case", { eventType: "evidence_opened", assetId: "asset" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveStart(Response.json({ sessionId: "owned-session" }));
    await evidence;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe("/api/player-sessions/owned-session/activity-events");
  });
  it("retries an unavailable save with the same event ID", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { sessionStorage: { getItem: () => "session" } });
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const task = recordGameActivity("game", "case", { eventType: "evidence_opened", assetId: "asset" });
    await vi.runAllTimersAsync(); await task;
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
  });
});
