import { env } from "cloudflare:workers";

import { requireResearchParticipant } from "../../../lib/server/research-access";

export const dynamic = "force-dynamic";

function noStoreResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

export async function GET(request: Request): Promise<Response> {
  const participant = await requireResearchParticipant(request);

  if (participant instanceof Response) {
    return participant;
  }

  const [progress, achievements, letter] = await env.DB.batch([
    env.DB.prepare(
      `SELECT games.id AS game_id,
              games.slug AS game_slug,
              subgames.id AS subgame_id,
              subgames.slug AS subgame_slug,
              subgames.title AS subgame_title,
              subgame_progress.status,
              subgame_progress.started_at,
              subgame_progress.last_activity_at,
              subgame_progress.completed_at
         FROM subgame_progress
         INNER JOIN subgames ON subgames.id = subgame_progress.subgame_id
         INNER JOIN games ON games.id = subgames.game_id
        WHERE subgame_progress.user_id = ?
        ORDER BY games.sort_order ASC, subgames.created_at ASC`,
    ).bind(participant.userId),
    env.DB.prepare(
      `SELECT eligible_at, letter_emailed_at, status
         FROM thank_you_letters WHERE user_id = ?`,
    ).bind(participant.userId),
    env.DB.prepare(
      `SELECT achievement_key, subgame_id, earned_at
         FROM achievements
        WHERE user_id = ?
        ORDER BY earned_at DESC`,
    ).bind(participant.userId),
  ]);

  return noStoreResponse({
    achievements: achievements.results,
    letter: letter.results[0] ?? null,
    progress: progress.results,
  });
}
