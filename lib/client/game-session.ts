/** Share the start request so opening evidence immediately still has an owned session. */
const starts = new Map<string, Promise<string | null>>();
async function retryJson(url: string, body: unknown): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { body: JSON.stringify(body), credentials: "same-origin", headers: { "Content-Type": "application/json" }, method: "POST", keepalive: true });
      if (response.ok) return await response.json() as Record<string, unknown>;
      if (response.status < 500 && response.status !== 429) return null;
    } catch { /* Retry with the same event ID to avoid counting twice. */ }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
  }
  return null;
}
export function startGameSession(gameId: string, subgameId: string): Promise<string | null> {
  const key = `${gameId}:${subgameId}`;
  const existing = starts.get(key);
  if (existing) return existing;
  const work = retryJson("/api/player-sessions", { eventId: crypto.randomUUID(), gameId, subgameId }).then(payload => {
    const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : null;
    if (sessionId) {
      try { window.sessionStorage.setItem(`jao-ngoh-session:${subgameId}`, sessionId); } catch { /* Storage is optional. */ }
    }
    return sessionId;
  }).finally(() => { starts.delete(key); });
  starts.set(key, work);
  return work;
}
export async function recordGameActivity(gameId: string, subgameId: string, input: Record<string, string>) {
  let sessionId: string | null = null;
  const start = starts.get(`${gameId}:${subgameId}`);
  if (start) sessionId = await start;
  else {
    try { sessionId = window.sessionStorage.getItem(`jao-ngoh-session:${subgameId}`); } catch { /* Start works without storage. */ }
    sessionId ??= await startGameSession(gameId, subgameId);
  }
  if (!sessionId) return;
  await retryJson(`/api/player-sessions/${encodeURIComponent(sessionId)}/activity-events`, { ...input, eventId: crypto.randomUUID() });
}
