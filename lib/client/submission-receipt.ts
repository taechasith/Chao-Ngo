export type ReceiptResult =
  | { kind: "received"; status: "submitted" | "accepted" | "needs_revision" }
  | { kind: "draft" | "reauth" | "unconfirmed" }
  | { kind: "rejected"; code: string };

function received(body: Record<string, unknown> | null, id: string): ReceiptResult | undefined {
  if (body?.submissionId !== id || typeof body.submittedAt !== "string" || !body.submittedAt) return;
  const status = body.submissionStatus;
  if (status === "submitted" || status === "accepted" || status === "needs_revision") return { kind: "received", status };
}

const urlFor = (id: string) => `/api/submissions/${encodeURIComponent(id)}/finalize`;
async function bodyOf(response: Response): Promise<Record<string, unknown> | null> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

export async function readSubmissionReceipt(id: string): Promise<ReceiptResult> {
  try {
    const response = await fetch(urlFor(id), {
      credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 401) return { kind: "reauth" };
    if (!response.ok) return { kind: "unconfirmed" };
    const body = await bodyOf(response);
    if (body?.submissionId === id && body.submissionStatus === "draft") return { kind: "draft" };
    return received(body, id) ?? { kind: "unconfirmed" };
  } catch {
    return { kind: "unconfirmed" };
  }
}

export async function sendSubmission(id: string): Promise<ReceiptResult> {
  try {
    const response = await fetch(urlFor(id), {
      method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(75_000),
    });
    if (response.status === 401) return { kind: "reauth" };
    const body = await bodyOf(response);
    if (response.ok) {
      const receipt = received(body, id);
      if (receipt) return receipt;
    } else if (response.status < 500 && body?.code !== "SUBMISSION_ALREADY_FINALIZED") {
      return { kind: "rejected", code: typeof body?.code === "string" ? body.code : "" };
    }
  } catch {
    // The write may have committed before the connection dropped. Reconcile before another POST.
  }
  return readSubmissionReceipt(id);
}
