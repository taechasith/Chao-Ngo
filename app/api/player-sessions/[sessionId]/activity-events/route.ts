import { env } from "cloudflare:workers";

import {
  type PlayerActivityEventInput,
  playerActivityEventSchema,
  playerInitiatedEventLimitPerMinute,
} from "../../../../../lib/server/activity/contracts";
import { readBoundedJson } from "../../../../../lib/server/questionnaires/request";
import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

type ActivityEventRow = {
  asset_id: string | null;
  event_type: string;
  session_id: string | null;
  timeline_node_id: string | null;
  user_id: string | null;
};

type PlayerSessionRow = {
  completed_at: string | null;
  game_id: string;
  subgame_id: string;
};

function noStoreResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

function eventContext(input: PlayerActivityEventInput) {
  return {
    assetId: input.eventType === "evidence_opened" ? input.assetId : null,
    timelineNodeId: input.eventType === "timeline_node_opened" ? input.timelineNodeId : null,
  };
}

function matchesEvent(
  event: ActivityEventRow,
  input: PlayerActivityEventInput,
  sessionId: string,
  userId: string,
): boolean {
  const context = eventContext(input);

  return (
    event.user_id === userId &&
    event.session_id === sessionId &&
    event.event_type === input.eventType &&
    event.timeline_node_id === context.timelineNodeId &&
    event.asset_id === context.assetId
  );
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

async function validateEventResource(
  input: PlayerActivityEventInput,
  gameId: string,
): Promise<boolean> {
  if (input.eventType === "assistant_link_opened") {
    return true;
  }

  if (input.eventType === "timeline_node_opened") {
    const node = await env.DB.prepare(
      `SELECT id
         FROM timeline_nodes
        WHERE id = ? AND game_id = ? AND published = 1`,
    )
      .bind(input.timelineNodeId, gameId)
      .first<{ id: string }>();

    return Boolean(node);
  }

  const asset = await env.DB.prepare(
    `SELECT assets.id
       FROM assets
       LEFT JOIN timeline_nodes ON timeline_nodes.id = assets.timeline_node_id
       LEFT JOIN subgames ON subgames.id = assets.subgame_id
      WHERE assets.id = ?
        AND assets.player_visible = 1
        AND (timeline_nodes.game_id = ? OR subgames.game_id = ?)`,
  )
    .bind(input.assetId, gameId, gameId)
    .first<{ id: string }>();

  return Boolean(asset);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (!isSameOriginRequest(request)) return noStoreResponse({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);

  if (participant instanceof Response) {
    return participant;
  }

  const parsed = playerActivityEventSchema.safeParse(await readBoundedJson(request, 1_024));

  if (!parsed.success) {
    return noStoreResponse({ code: "INVALID_ACTIVITY_EVENT" }, 400);
  }

  const { sessionId } = await context.params;
  const session = await env.DB.prepare(
    `SELECT completed_at, game_id, subgame_id
       FROM player_sessions
      WHERE id = ? AND user_id = ?`,
  )
    .bind(sessionId, participant.userId)
    .first<PlayerSessionRow>();

  if (!session) {
    return noStoreResponse({ code: "PLAYER_SESSION_NOT_FOUND" }, 404);
  }

  if (session.completed_at) {
    return noStoreResponse({ code: "PLAYER_SESSION_COMPLETED" }, 409);
  }

  const existing = await env.DB.prepare(
    `SELECT asset_id, event_type, session_id, timeline_node_id, user_id
       FROM activity_events
      WHERE event_id = ?`,
  )
    .bind(parsed.data.eventId)
    .first<ActivityEventRow>();

  if (existing) {
    if (!matchesEvent(existing, parsed.data, sessionId, participant.userId)) {
      return noStoreResponse({ code: "EVENT_ID_REUSED" }, 409);
    }

    return noStoreResponse({ status: "already_recorded" });
  }

  if (await hasReachedEventLimit(participant.userId)) {
    return noStoreResponse({ code: "ACTIVITY_RATE_LIMITED" }, 429);
  }

  if (!(await validateEventResource(parsed.data, session.game_id))) {
    return noStoreResponse({ code: "ACTIVITY_RESOURCE_NOT_FOUND" }, 404);
  }

  const resourceContext = eventContext(parsed.data);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO activity_events (
         id, event_id, user_id, session_id, event_type, game_id, subgame_id,
         timeline_node_id, asset_id, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
    ).bind(
      crypto.randomUUID(),
      parsed.data.eventId,
      participant.userId,
      sessionId,
      parsed.data.eventType,
      session.game_id,
      session.subgame_id,
      resourceContext.timelineNodeId,
      resourceContext.assetId,
    ),
    env.DB.prepare(
      `UPDATE player_sessions
          SET last_seen_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND completed_at IS NULL`,
    ).bind(sessionId, participant.userId),
    env.DB.prepare(
      `UPDATE subgame_progress
          SET last_activity_at = CURRENT_TIMESTAMP,
              player_session_id = ?
        WHERE user_id = ? AND subgame_id = ? AND status = 'in_progress'`,
    ).bind(sessionId, participant.userId, session.subgame_id),
  ]);

  return noStoreResponse({ status: "recorded" }, 201);
}
