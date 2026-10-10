/* global fetch, URL, setTimeout */

function mayRetry(input, init) {
  const path = new URL(input, "https://chao-ngo.invalid").pathname;
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET") return path.startsWith("/api/") && !path.startsWith("/api/auth/");
  if (method === "PATCH") return path === "/api/player-research-profile" || /^\/api\/submissions\/[^/]+\/preparation$/.test(path);
  if (method === "POST") return /^\/api\/(questionnaire-sessions\/[^/]+\/complete|submissions\/[^/]+\/(acknowledgement|finalize|uploads\/admission))$/.test(path);
  return false;
}

/** Retry only an explicit transient DB response and an idempotent operation.
 * Network failures and actual file uploads are never replayed here.
 */
export async function fetchWithDatabaseRetry(input, init = {}, options = {}) {
  const send = options.fetcher ?? fetch;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const retryable = mayRetry(input, init) && (init.body === undefined || typeof init.body === "string");
  for (let attempt = 0; ; attempt++) {
    const response = await send(input, init);
    if (!retryable || response.status !== 503 || attempt >= 3) return response;
    const body = await response.clone().json().catch(() => null);
    if (body?.code !== "DATABASE_BUSY") return response;
    options.onRetry?.(attempt + 1);
    const requested = Number(response.headers.get("Retry-After"));
    const delay = Number.isFinite(requested) && requested > 0 ? Math.min(10_000, requested * 1000) : 2000;
    await response.body?.cancel();
    await sleep(delay + Math.floor(Math.random() * 500));
  }
}
