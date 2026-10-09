/** Recognize transient infrastructure failures; never replay writes here. */
export function isSessionServiceUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const failure = error as { statusCode?: number; body?: { code?: string } };
  return failure.statusCode === 500 && failure.body?.code === "FAILED_TO_GET_SESSION";
}

export function isD1Overload(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (/D1(?:_ERROR| DB).*overloaded|requests queued for too long/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

export function isRetryableD1Error(error: unknown): boolean {
  if (isD1Overload(error) || isSessionServiceUnavailable(error)) return true;
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (/D1_ERROR:\s*Network connection lost\.?$/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

export function databaseBusyResponse(): Response {
  return Response.json({ code: "DATABASE_BUSY" }, {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "2" },
  });
}

export function withD1RetryableErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (!isRetryableD1Error(error)) throw error;
      console.warn(isD1Overload(error) ? "D1 queue overloaded: player request can be retried" : isSessionServiceUnavailable(error) ? "Session service unavailable: player request can be retried" : "D1 connection lost: player request can be retried");
      return databaseBusyResponse();
    }
  };
}
