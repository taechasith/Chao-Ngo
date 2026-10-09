import { describe, expect, it, vi } from "vitest";
import { AdmissionBusyError, isFinalizationRequest, RequestAdmission, needsDatabaseAdmission, isSubmissionUpload, uploadAdmissionCost } from "./request-admission";

describe("global finalization admission", () => {
  it("runs 300 callers in order with at most 20 active and preserves each result", async () => {
    const admission = new RequestAdmission();
    let active = 0, peak = 0;
    const started: number[] = [];
    const results = await Promise.all(Array.from({ length: 300 }, (_, index) => admission.run(async () => {
      started.push(index); active++; peak = Math.max(peak, active);
      await Promise.resolve(); active--;
      return index;
    })));
    expect(peak).toBe(20);
    expect(started).toEqual(Array.from({ length: 300 }, (_, index) => index));
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

  it("coordinates only finalization POSTs, retaining the normal public/auth routes", () => {
    expect(isFinalizationRequest(new Request("https://example.test/api/submissions/id/finalize", { method: "POST" }))).toBe(true);
    for (const path of ["/api/auth/sign-in/social", "/api/submissions/id/uploads", "/play", "/api/submissions/id/finalize/other"]) {
      expect(isFinalizationRequest(new Request(`https://example.test${path}`, { method: "POST" }))).toBe(false);
    }
    expect(isFinalizationRequest(new Request("https://example.test/api/submissions/id/finalize"))).toBe(false);
  });
});


describe("whole-game D1 admission", () => {
  it("gates auth, reads, autosave, refresh, uploads and server-rendered pages; assets stay separate", () => {
    for (const path of ["/api/auth/get-session", "/api/submissions", "/api/questionnaires/revisions", "/api/questionnaire-sessions/s/responses", "/api/questionnaire-sessions/s/refresh", "/submit", "/play/ka-casefiles", "/privacy"]) {
      expect(needsDatabaseAdmission(new Request(`https://example.test${path}`))).toBe(true);
    }
    expect(needsDatabaseAdmission(new Request("https://example.test/assets/app.js"))).toBe(false);
    const upload = new Request("https://example.test/api/submissions/id/uploads", { method:"POST", headers:{"Content-Length":String(20*1024*1024+2000)} });
    expect(isSubmissionUpload(upload)).toBe(true);
    expect(uploadAdmissionCost(upload)).toBe(11);
    expect(uploadAdmissionCost(new Request(upload.url,{method:"POST"}))).toBe(12);
  });
  it("keeps weighted permits FIFO and releases each one exactly once", async () => {
    const admission = new RequestAdmission(3);
    const first = await admission.acquire(2), started:string[]=[];
    const large = admission.run(async()=>{started.push("large");return "saved";},3);
    const small = admission.run(async()=>{started.push("small");return "saved";});
    await Promise.resolve();expect(started).toEqual([]);
    first();first();
    expect(await large).toBe("saved");expect(await small).toBe("saved");
    expect(started).toEqual(["large","small"]);
    const full=await admission.acquire(3);full();
  });
});
