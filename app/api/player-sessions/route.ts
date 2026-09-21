import { env } from "cloudflare:workers";

import {
  playerInitiatedEventLimitPerMinute,
  playerSessionStartSchema,
} from "../../../lib/server/activity/contracts";
import { readBoundedJson } from "../../../lib/server/questionnaires/request";
import { requireResearchParticipant } from "../../../lib/server/research-access";
import { isSameOriginRequest } from "../../../lib/server/request-security";
import { isWithinPlayerMutationLimit } from "../../../lib/server/request-limits";

export const dynamic = "force-dynamic";

type ActivityEventRow = {
  event_type: string;
  game_id: string | null;
  session_id: string | null;
  subgame_id: string | null;
  user_id: string | null;
};

type PlayerSessionRow = {
  id: string;
};

function noStoreResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

async function getExistingEvent(eventId: string): Promise<ActivityEventRow | null> {
  return env.DB.prepare(
    `SELECT event_type, game_id, session_id, subgame_id, user_id
       FROM activity_events
      WHERE event_id = ?`,
  )
    .bind(eventId)
    .first<ActivityEventRow>();
}

async function getActiveSession(userId: string, subgameId: string): Promise<PlayerSessionRow | null> {
  return env.DB.prepare(
    `SELECT id
       FROM player_sessions
      WHERE user_id = ? AND subgame_id = ? AND completed_at IS NULL
      ORDER BY last_seen_at DESC
      LIMIT 1`,
  )
    .bind(userId, subgameId)
    .first<PlayerSessionRow>();
}

async function hasReachedEventLimit(userId: string): Promise<boolean> {
  const result = await env.DB.prepare(
    `SELECT COUNT(*) AS event_count
       FROM activity_events
      WHERE user_id = ? AND occurred_at >= datetime('now', '-1 minute')`,
  )
    .bind(userId)
    .first<{ event_count: number }>();

  return (result?.event_count ?? 0) >= playerInitiatedEventLimitPerMinute;
}

function matchesStartEvent(
  event: ActivityEventRow,
  userId: string,
  gameId: string,
  subgameId: string,
): boolean {
  return (
    event.user_id === userId &&
    event.event_type === "subgame_started" &&
    event.game_id === gameId &&
    event.subgame_id === subgameId &&
    event.session_id !== null
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return noStoreResponse({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);

  if (participant instanceof Response) {
    return participant;
  }
  if (!(await isWithinPlayerMutationLimit(participant.userId, "player-session", 12))) return noStoreResponse({ code: "REQUEST_RATE_LIMITED" }, 429);

  const parsed = playerSessionStartSchema.safeParse(await readBoundedJson(request, 1_024));

  if (!parsed.success) {
    return noStoreResponse({ code: "INVALID_PLAYER_SESSION" }, 400);
  }

  const { eventId, gameId, subgameId } = parsed.data;
  const existingEvent = await getExistingEvent(eventId);

  if (existingEvent) {
    if (!matchesStartEvent(existingEvent, participant.userId, gameId, subgameId)) {
      return noStoreResponse({ code: "EVENT_ID_REUSED" }, 409);
    }

    return noStoreResponse({
      sessionId: existingEvent.session_id,
      status: "already_started",
    });
  }

  const playableSubgame = await env.DB.prepare(
    `SELECT subgames.id
       FROM subgames
       INNER JOIN games ON games.id = subgames.game_id
      WHERE subgames.id = ?
        AND games.id = ?
        AND games.status = 'playable'
        AND subgames.status = 'playable'`,
  )
    .bind(subgameId, gameId)
    .first<{ id: string }>();

  if (!playableSubgame) {
    return noStoreResponse({ code: "PLAYABLE_SUBGAME_NOT_FOUND" }, 404);
  }

  const progress = await env.DB.prepare(
    `SELECT status
       FROM subgame_progress
      WHERE user_id = ? AND subgame_id = ?`,
  )
    .bind(participant.userId, subgameId)
    .first<{ status: "completed" | "in_progress" | "not_started" }>();

  if (progress?.status === "completed") {
    return noStoreResponse({ code: "SUBGAME_ALREADY_COMPLETED" }, 409);
  }

  const activeSession = await getActiveSession(participant.userId, subgameId);

  if (activeSession) {
    await env.DB.prepare(
      `UPDATE player_sessions
          SET last_seen_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND completed_at IS NULL`,
    )
      .bind(activeSession.id, participant.userId)
      .run();

    return noStoreResponse({ sessionId: activeSession.id, status: "resumed" });
  }

  if (await hasReachedEventLimit(participant.userId)) {
    return noStoreResponse({ code: "ACTIVITY_RATE_LIMITED" }, 429);
  }

  const sessionId = crypto.randomUUID();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO player_sessions (id, user_id, game_id, subgame_id)
         VALUES (?, ?, ?, ?)`,
      ).bind(sessionId, participant.userId, gameId, subgameId),
      env.DB.prepare(
        `INSERT INTO subgame_progress (
           user_id, subgame_id, status, started_at, last_activity_at, player_session_id
         ) VALUES (?, ?, 'in_progress', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
         ON CONFLICT(user_id, subgame_id) DO UPDATE SET
           status = 'in_progress',
           last_activity_at = CURRENT_TIMESTAMP,
           player_session_id = excluded.player_session_id`,
      ).bind(participant.userId, subgameId, sessionId),
      env.DB.prepare(
        `INSERT INTO achievements (
           id, user_id, achievement_key, subgame_id, scope_key, metadata_json
         ) VALUES (?, ?, 'investigation_begun', ?, ?, ?)
         ON CONFLICT(user_id, achievement_key, scope_key) DO NOTHING`,
      ).bind(
        crypto.randomUUID(),
        participant.userId,
        subgameId,
        subgameId,
        JSON.stringify({ source: "player_session_start", version: "1.0.0" }),
      ),
      env.DB.prepare(
        `INSERT INTO activity_events (
           id, event_id, user_id, session_id, event_type, game_id, subgame_id, payload_json
         ) VALUES (?, ?, ?, ?, 'subgame_started', ?, ?, '{}')`,
      ).bind(crypto.randomUUID(), eventId, participant.userId, sessionId, gameId, subgameId),
    ]);
  } catch (error) {
    const replayedEvent = await getExistingEvent(eventId);

    if (replayedEvent && matchesStartEvent(replayedEvent, participant.userId, gameId, subgameId)) {
      return noStoreResponse({
        sessionId: replayedEvent.session_id,
        status: "already_started",
      });
    }

    const concurrentSession = await getActiveSession(participant.userId, subgameId);

    if (!concurrentSession) {
      throw error;
    }

    return noStoreResponse({ sessionId: concurrentSession.id, status: "resumed" });
  }

  return noStoreResponse({ sessionId, status: "started" }, 201);
}
