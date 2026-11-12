import { afterEach, describe, expect, it, vi } from "vitest";
import { readSubmissionReceipt, sendSubmission } from "./submission-receipt";

const id = "qa-submission";
const receipt = { submissionId: id, submissionStatus: "submitted", submittedAt: "2026-11-12 00:00:00" };

afterEach(() => vi.unstubAllGlobals());
describe("recovering a submission response", () => {
  it.each([500, 503])("checks D1 before any second POST after HTTP %i", async status => {
    const request = vi.fn().mockResolvedValueOnce(new Response("<html>temporary error</html>", { status }))
      .mockResolvedValueOnce(Response.json(receipt));
    vi.stubGlobal("fetch", request);
    expect(await sendSubmission(id)).toEqual({ kind: "received", status: "submitted" });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1].method).toBe("POST");
    expect(request.mock.calls[1][1]).toMatchObject({ cache: "no-store" });
    expect(request.mock.calls[1][1].method).toBeUndefined();
  });

  it("allows a manual retry only after a lost connection is confirmed as a draft", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(Response.json({ ...receipt, submissionStatus: "draft", submittedAt: null })));
    expect(await sendSubmission(id)).toEqual({ kind: "draft" });
  });

  it("recognizes a lost session and never accepts a different receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ...receipt, submissionId: "another-submission" })));
    expect(await sendSubmission(id)).toEqual({ kind: "reauth" });
    expect(await readSubmissionReceipt(id)).toEqual({ kind: "unconfirmed" });
  });

  it("keeps the action unconfirmed if the status request also fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await sendSubmission(id)).toEqual({ kind: "unconfirmed" });
  });
});
