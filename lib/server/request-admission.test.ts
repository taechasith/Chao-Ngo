import { describe, expect, it, vi } from "vitest";
import { AdmissionBusyError, isCoordinatedWrite, isFinalizationRequest, RequestAdmission } from "./request-admission";

describe("global finalization admission", () => {
  it("runs 1,000 callers in order with at most 20 active and preserves each result", async () => {
    const admission = new RequestAdmission();
    let active = 0, peak = 0;
    const started: number[] = [];
    const results = await Promise.all(Array.from({ length: 1_000 }, (_, index) => admission.run(async () => {
      started.push(index); active++; peak = Math.max(peak, active);
      await Promise.resolve(); active--;
      return index;
    })));
    expect(peak).toBe(20);
    expect(started).toEqual(Array.from({ length: 1_000 }, (_, index) => index));
    expect(results).toEqual(started);
  });

  it("releases a failed slot and rejects overflow/expired waiters without running their writes", async () => {
    vi.useFakeTimers();
    try {
      const admission = new RequestAdmission(1, 1, 100);
      let release!: () => void;
      const first = admission.run(() => new Promise<void>(resolve => { release = resolve; }));
      await Promise.resolve();
      const write = vi.fn(async () => "saved");
      const queued = admission.run(write);
      const expired = expect(queued).rejects.toBeInstanceOf(AdmissionBusyError);
      await expect(admission.run(write)).rejects.toBeInstanceOf(AdmissionBusyError);
      await vi.advanceTimersByTimeAsync(100);
      await expired;
      expect(write).not.toHaveBeenCalled();
      release(); await first;
      await expect(admission.run(async () => { throw new Error("write failed"); })).rejects.toThrow("write failed");
      await expect(admission.run(write)).resolves.toBe("saved");
    } finally { vi.useRealTimers(); }
  });

  it("reserves capacity without running a handler and releases only once", async () => {
    const admission = new RequestAdmission(1, 1);
    const release = await admission.reserve();
    const second = admission.reserve();
    release();
    const releaseSecond = await second;
    const queued = admission.reserve();
    release();
    await expect(admission.reserve()).rejects.toBeInstanceOf(AdmissionBusyError);
    releaseSecond();
    (await queued)();
  });

  it("coordinates only finalization and completion POSTs, retaining the normal public/auth routes", () => {
    expect(isFinalizationRequest(new Request("https://example.test/api/submissions/id/finalize", { method: "POST" }))).toBe(true);
    expect(isCoordinatedWrite(new Request("https://example.test/api/questionnaire-sessions/id/complete", { method: "POST" }))).toBe(true);
    expect(isCoordinatedWrite(new Request("https://example.test/api/questionnaire-sessions/id/complete"))).toBe(false);
    for (const path of ["/api/auth/sign-in/social", "/api/submissions/id/uploads", "/play", "/api/submissions/id/finalize/other"]) {
      expect(isCoordinatedWrite(new Request(`https://example.test${path}`, { method: "POST" }))).toBe(false);
    }
    expect(isFinalizationRequest(new Request("https://example.test/api/submissions/id/finalize"))).toBe(false);
  });
});
