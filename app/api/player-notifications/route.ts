import { env } from "cloudflare:workers";

import { requireResearchParticipant } from "../../../lib/server/research-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;

  const [notifications, letter] = await env.DB.batch([
    env.DB.prepare(
      `SELECT body_th, created_at, kind, read_at
         FROM player_notifications WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 20`,
    ).bind(participant.userId),
    env.DB.prepare(
      `SELECT eligible_at, letter_emailed_at, status FROM thank_you_letters WHERE user_id = ?`,
    ).bind(participant.userId),
  ]);
  return Response.json({ letter: letter.results[0] ?? null, notifications: notifications.results }, { headers: { "Cache-Control": "no-store" } });
}
