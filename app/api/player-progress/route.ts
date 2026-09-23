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

  const [progress, achievements, letter, evidence, submissions, consent] = await env.DB.batch([
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
      `SELECT achievement_key, subgame_id, earned_at
         FROM achievements
        WHERE user_id = ?
        ORDER BY earned_at DESC`,
    ).bind(participant.userId),
    env.DB.prepare(
      `SELECT eligible_at, letter_emailed_at, status
         FROM thank_you_letters WHERE user_id = ?`,
    ).bind(participant.userId),
    env.DB.prepare(
      `SELECT subgames.id AS subgame_id,
              COUNT(DISTINCT assets.id) AS evidence_total,
              COUNT(DISTINCT CASE WHEN activity_events.event_type = 'evidence_opened' THEN activity_events.asset_id END) AS evidence_viewed,
              MAX(activity_events.occurred_at) AS last_evidence_at
         FROM subgames
         LEFT JOIN assets ON assets.player_visible = 1
          AND (assets.subgame_id = subgames.id OR assets.timeline_node_id = subgames.timeline_node_id)
         LEFT JOIN activity_events ON activity_events.user_id = ?
          AND activity_events.subgame_id = subgames.id
          AND activity_events.event_type = 'evidence_opened'
        GROUP BY subgames.id`,
    ).bind(participant.userId),
    env.DB.prepare(
      `SELECT submissions.subgame_id, submissions.status, submissions.updated_at,
              MAX(CASE WHEN uploads.kind = 'ai_chat_pdf' AND uploads.status IN ('uploaded', 'accepted') THEN 1 ELSE 0 END) AS ai_pdf_uploaded
         FROM submissions
         LEFT JOIN uploads ON uploads.submission_id = submissions.id
        WHERE submissions.user_id = ?
        GROUP BY submissions.id
        ORDER BY submissions.updated_at DESC`,
    ).bind(participant.userId),
    env.DB.prepare(
      `SELECT consent_version, consented_at, ai_chat_upload_consent
         FROM consent_records
        WHERE user_id = ? AND research_participation = 1 AND withdrawn_at IS NULL
        ORDER BY consented_at DESC LIMIT 1`,
    ).bind(participant.userId),
  ]);

  return noStoreResponse({
    achievements: achievements.results,
    consent: consent.results[0] ?? null,
    evidence: evidence.results,
    letter: letter.results[0] ?? null,
    progress: progress.results,
    submissions: submissions.results,
  });
}
