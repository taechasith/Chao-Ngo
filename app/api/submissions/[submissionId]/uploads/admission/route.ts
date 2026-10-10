import { env } from "cloudflare:workers";
import { z } from "zod";
import { withD1RetryableErrorHandling } from "../../../../../../lib/server/d1-overload";
import { requireResearchParticipant } from "../../../../../../lib/server/research-access";
import { aiChatUploadConsentVersion } from "../../../../../../lib/server/research-consent-copy";
import { readBoundedJson } from "../../../../../../lib/server/questionnaires/request";
import { isSameOriginRequest } from "../../../../../../lib/server/request-security";
import { isWithinPlayerMutationLimit } from "../../../../../../lib/server/request-limits";
import { maximumPrivateUploadBytes } from "../../../../../../lib/server/submissions/requirements";

export const dynamic = "force-dynamic";
const schema = z.object({ bytes: z.number().int().min(12).max(maximumPrivateUploadBytes) }).strict();
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Small preflight only. The production Worker replaces this with a one-use upload permit. */
export const POST = withD1RetryableErrorHandling(async (request: Request, context: { params: Promise<{ submissionId: string }> }) => {
  if (!isSameOriginRequest(request)) return response({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;
  if (!(await isWithinPlayerMutationLimit(participant.userId, "upload-admission", 12))) return response({ code: "REQUEST_RATE_LIMITED" }, 429);
  const parsed = schema.safeParse(await readBoundedJson(request, 1024));
  if (!parsed.success) return response({ code: "PDF_SIZE_INVALID" }, 400);
  const { submissionId } = await context.params;
  const draft = await env.DB.prepare(`SELECT s.id, EXISTS(SELECT 1 FROM submission_consent_acknowledgements a
    WHERE a.submission_id=s.id AND a.user_id=s.user_id AND a.consent_version=?) AS acknowledged
    FROM submissions s WHERE s.id=? AND s.user_id=? AND s.status='draft'`)
    .bind(aiChatUploadConsentVersion, submissionId, participant.userId).first<{ acknowledged: number }>();
  if (!draft) return response({ code: "DRAFT_NOT_FOUND" }, 404);
  if (!draft.acknowledged) return response({ code: "ACKNOWLEDGEMENT_REQUIRED" }, 403);
  return response({ admission: { bytes: parsed.data.bytes, submissionId, userId: participant.userId } });
});
