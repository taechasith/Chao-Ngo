"use client";

import { useEffect } from "react";
import { startGameSession } from "../../lib/client/game-session";

export function GameSessionStarter({ gameId = "game-node-zone", subgameId }: { gameId?: string; subgameId: string }) {
  useEffect(() => { void startGameSession(gameId, subgameId); }, [gameId, subgameId]);
  return null;
}
