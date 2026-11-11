/** Use for reads and operations that return an existing result after a committed retry. */
export async function fetchWithDatabaseRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 503 || attempt >= 2 || init?.signal?.aborted) return response;
    const retryAfter = Number(response.headers.get("Retry-After"));
    const delay = Math.max(1_500 * (attempt + 1), Math.min(8_000, (retryAfter || 0) * 1_000));
    void response.body?.cancel().catch(() => {});
    await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 1_500));
    init?.signal?.throwIfAborted();
  }
}
