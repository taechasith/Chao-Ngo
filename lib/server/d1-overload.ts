/** Only known transient D1 failures are retryable; never replay writes here. */
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
  if (isD1Overload(error)) return true;
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (/D1_ERROR:\s*Network connection lost\.?$/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

export function withD1RetryableErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (!isRetryableD1Error(error)) throw error;
      console.warn("D1 transient failure: player request can be retried");
      return Response.json({ code: "DATABASE_BUSY" }, {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "2" },
      });
    }
  };
}
