"use client";

import { useEffect, useRef } from "react";

export function GameSessionStarter({ gameId = "game-node-zone", subgameId }: { gameId?: string; subgameId: string }) {
  const eventIdRef = useRef<string | null>(null);

  useEffect(() => {
    eventIdRef.current ??= typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    void fetch("/api/player-sessions", {
      body: JSON.stringify({ eventId: eventIdRef.current, gameId, subgameId }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { sessionId?: string };
      if (payload.sessionId) {
        try { window.sessionStorage.setItem(`jao-ngoh-session:${subgameId}`, payload.sessionId); } catch { /* Session storage is optional. */ }
      }
    }).catch(() => undefined);
  }, [gameId, subgameId]);

  return null;
}
