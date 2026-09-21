import { env } from "cloudflare:workers";

import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { aiChatUploadConsentVersion } from "../../../../../lib/server/research-consent-copy";
import { readBoundedJson } from "../../../../../lib/server/questionnaires/request";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";
import { isWithinPlayerMutationLimit } from "../../../../../lib/server/request-limits";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ submissionId: string }> };

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store" }, status });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (!isSameOriginRequest(request)) return response({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;
  if (!(await isWithinPlayerMutationLimit(participant.userId, "submission-acknowledgement", 12))) return response({ code: "REQUEST_RATE_LIMITED" }, 429);

  const body = await readBoundedJson(request, 1_024);
  if (typeof body !== "object" || body === null) return response({ code: "INVALID_ACKNOWLEDGEMENT" }, 400);
  const input = body as { acknowledged?: unknown; consentVersion?: unknown };
  if (input.acknowledged !== true || input.consentVersion !== aiChatUploadConsentVersion) {
    return response({ code: "ACKNOWLEDGEMENT_REQUIRED" }, 400);
  }

  const { submissionId } = await context.params;
  const draft = await env.DB.prepare(
    "SELECT id FROM submissions WHERE id = ? AND user_id = ? AND status = 'draft'",
  ).bind(submissionId, participant.userId).first<{ id: string }>();
  if (!draft) return response({ code: "DRAFT_NOT_FOUND" }, 404);

  await env.DB.prepare(
    `INSERT INTO submission_consent_acknowledgements (id, submission_id, user_id, consent_version)
     SELECT ?, ?, ?, ?
     WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND user_id = ? AND status = 'draft')
     ON CONFLICT(submission_id) DO UPDATE SET
       user_id = excluded.user_id,
       consent_version = excluded.consent_version,
       acknowledged_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), submissionId, participant.userId, aiChatUploadConsentVersion, submissionId, participant.userId).run();

  return response({ status: "acknowledged" }, 201);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  if (!isSameOriginRequest(request)) return response({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;
  if (!(await isWithinPlayerMutationLimit(participant.userId, "submission-acknowledgement", 12))) return response({ code: "REQUEST_RATE_LIMITED" }, 429);

  const { submissionId } = await context.params;
  const result = await env.DB.prepare(
    `DELETE FROM submission_consent_acknowledgements
      WHERE submission_id = ? AND user_id = ?
        AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND user_id = ? AND status = 'draft')`,
  ).bind(submissionId, participant.userId, submissionId, participant.userId).run();

  return response({ status: result.meta.changes ? "withdrawn" : "unchanged" });
}
