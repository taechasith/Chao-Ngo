import { env } from "cloudflare:workers";

import { getAuth, getAuthReadinessForRuntime } from "./auth";
import { isResearchCollectionReady } from "./research-policy";
import { getResearchCollectionPolicy } from "./research-runtime";

export type ResearchParticipant = {
  consentVersion: string;
  dataNoticeVersion: string;
  minimumParticipantAge: number;
  userId: string;
};

function noStoreResponse(body: Record<string, string>, status: number): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

export async function requireResearchParticipant(
  request: Request,
): Promise<ResearchParticipant | Response> {
  const researchCollectionPolicy = await getResearchCollectionPolicy();
  if (!isResearchCollectionReady(researchCollectionPolicy)) {
    return noStoreResponse({ code: "RESEARCH_CONSENT_UNAVAILABLE" }, 503);
  }

  if (!getAuthReadinessForRuntime().isReady) {
    return noStoreResponse({ code: "AUTH_NOT_CONFIGURED" }, 503);
  }

  const {
    consentVersion,
    dataNoticeVersion,
    minimumParticipantAge,
  } = researchCollectionPolicy;

  if (!consentVersion || !dataNoticeVersion || minimumParticipantAge === null) {
    return noStoreResponse({ code: "RESEARCH_CONSENT_UNAVAILABLE" }, 503);
  }

  const session = await getAuth().api.getSession({ headers: request.headers });

  if (!session) {
    return noStoreResponse({ code: "UNAUTHENTICATED" }, 401);
  }

  const account = await env.DB.prepare(
    `SELECT EXISTS (SELECT 1 FROM consent_records
       WHERE user_id = u.id AND consent_version = ? AND data_notice_version = ?
         AND research_participation = 1 AND withdrawn_at IS NULL) AS consent_active
       FROM "user" u WHERE id = ? AND emailVerified = 1 AND research_deletion_pending_at IS NULL
         AND (research_retention_expires_at IS NULL OR research_retention_expires_at > CURRENT_TIMESTAMP)`,
  ).bind(consentVersion, dataNoticeVersion, session.user.id).first<{ consent_active: number }>();
  if (!account) return noStoreResponse({ code: "RESEARCH_DATA_EXPIRED" }, 403);
  if (!account.consent_active) return noStoreResponse({ code: "RESEARCH_CONSENT_REQUIRED" }, 403);

  return {
    consentVersion,
    dataNoticeVersion,
    minimumParticipantAge,
    userId: session.user.id,
  };
}
