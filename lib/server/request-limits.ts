import { env } from "cloudflare:workers";

export async function isWithinPlayerMutationLimit(
  userId: string,
  action: string,
  maximumRequests: number,
  windowSeconds = 60,
): Promise<boolean> {
  const rateKey = `${action}:${userId}`;
  const row = await env.DB.prepare(
    `INSERT INTO player_rate_limits (rate_key, request_count, window_started_at, updated_at)
     VALUES (?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(rate_key) DO UPDATE SET
       request_count = CASE
         WHEN player_rate_limits.window_started_at <= datetime('now', '-' || ? || ' seconds') THEN 1
         ELSE player_rate_limits.request_count + 1
       END,
       window_started_at = CASE
         WHEN player_rate_limits.window_started_at <= datetime('now', '-' || ? || ' seconds') THEN CURRENT_TIMESTAMP
         ELSE player_rate_limits.window_started_at
       END,
       updated_at = CURRENT_TIMESTAMP
     RETURNING request_count`,
  ).bind(rateKey, windowSeconds, windowSeconds).first<{ request_count: number }>();
  return (row?.request_count ?? maximumRequests + 1) <= maximumRequests;
}
