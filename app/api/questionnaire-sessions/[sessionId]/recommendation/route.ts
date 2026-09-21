import { env } from "cloudflare:workers";

import { requireResearchParticipant } from "../../../../../lib/server/research-access";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const participant = await requireResearchParticipant(request);

  if (participant instanceof Response) {
    return participant;
  }

  const { sessionId } = await context.params;
  const result = await env.DB.prepare(
    `SELECT recommendation_results.rule_version,
            recommendation_results.recommended_subgame_id,
            recommendation_results.score_json
       FROM recommendation_results
       INNER JOIN questionnaire_sessions
         ON questionnaire_sessions.id = recommendation_results.questionnaire_session_id
      WHERE recommendation_results.questionnaire_session_id = ?
        AND questionnaire_sessions.user_id = ?`,
  )
    .bind(sessionId, participant.userId)
    .first<{
      recommended_subgame_id: string;
      rule_version: string;
      score_json: string;
    }>();

  if (!result) {
    return Response.json(
      { code: "RECOMMENDATION_NOT_FOUND" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404,
      },
    );
  }

  let scores: unknown;

  try {
    scores = JSON.parse(result.score_json) as unknown;
  } catch {
    return Response.json(
      { code: "RECOMMENDATION_DATA_INVALID" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 500,
      },
    );
  }

  return Response.json(
    {
      recommendedSubgameId: result.recommended_subgame_id,
      ruleVersion: result.rule_version,
      scores,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
