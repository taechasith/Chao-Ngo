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
    }).catch(() => undefined);
  }, [gameId, subgameId]);

  return null;
}
