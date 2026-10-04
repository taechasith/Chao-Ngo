/** Overload is retryable; do not hide schema/validation errors or replay writes here. */
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

export function withD1OverloadHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (!isD1Overload(error)) throw error;
      console.warn("D1 overload: player request can be retried");
      return Response.json({ code: "DATABASE_BUSY" }, {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "2" },
      });
    }
  };
}
