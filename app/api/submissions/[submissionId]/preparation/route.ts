import { env } from "cloudflare:workers";
import { withD1RetryableErrorHandling } from "../../../../../lib/server/d1-overload";
import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";
import { isWithinPlayerMutationLimit } from "../../../../../lib/server/request-limits";
import { readBoundedJson } from "../../../../../lib/server/questionnaires/request";
import { parseAdditionalAiLinks } from "../../../../../lib/ai-preparation";
export const dynamic = "force-dynamic";
function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
async function handlePATCH(request: Request, context: { params: Promise<{ submissionId: string }> }) {
  if (!isSameOriginRequest(request)) return json({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;
  if (!(await isWithinPlayerMutationLimit(participant.userId, "submission-preparation", 30))) return json({ code: "REQUEST_RATE_LIMITED" }, 429);
  const { submissionId } = await context.params;
  const draft = await env.DB.prepare("SELECT status FROM submissions WHERE id = ? AND user_id = ?")
    .bind(submissionId, participant.userId).first<{ status: string }>();
  if (!draft) return json({ code: "SUBMISSION_NOT_FOUND" }, 404);
  if (draft.status !== "draft") return json({ code: "SUBMISSION_NOT_DRAFT" }, 409);
  const body = await readBoundedJson(request, 12_000) as { aiCompanionUsed?: unknown; additionalAiLinks?: unknown } | null;
  if (!body || typeof body.aiCompanionUsed !== "boolean") return json({ code: "INVALID_AI_PREPARATION" }, 400);
  const links = parseAdditionalAiLinks(body.additionalAiLinks);
  if (!links) return json({ code: "INVALID_ADDITIONAL_AI_LINKS" }, 400);
  const result = await env.DB.prepare(`UPDATE submissions SET additional_ai_links_json = ?,
    ai_companion_confirmed_at = CASE WHEN ? = 1 THEN COALESCE(ai_companion_confirmed_at, CURRENT_TIMESTAMP) ELSE NULL END,
    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND status = 'draft'`)
    .bind(JSON.stringify(links), body.aiCompanionUsed ? 1 : 0, submissionId, participant.userId).run();
  if (!result.meta.changes) return json({ code: "SUBMISSION_NOT_DRAFT" }, 409);
  return json({ preparation: { aiCompanionUsed: body.aiCompanionUsed, additionalAiLinks: links } });
}
export const PATCH = withD1RetryableErrorHandling(handlePATCH);
