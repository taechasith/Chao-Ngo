import { env } from "cloudflare:workers";

import { consentRecordInputSchema } from "../../../lib/server/consent";
import { getAuth, getAuthReadinessForRuntime } from "../../../lib/server/auth";
import {
  isResearchCollectionReady,
} from "../../../lib/server/research-policy";
import { getResearchCollectionPolicy } from "../../../lib/server/research-runtime";
import { isSameOriginRequest } from "../../../lib/server/request-security";
import { readBoundedJson } from "../../../lib/server/questionnaires/request";
import { isWithinPlayerMutationLimit } from "../../../lib/server/request-limits";

export const dynamic = "force-dynamic";

const unavailableResponse = () =>
  Response.json(
    { code: "RESEARCH_CONSENT_UNAVAILABLE" },
    {
      headers: { "Cache-Control": "no-store" },
      status: 503,
    },
  );

const authenticationUnavailableResponse = () =>
  Response.json(
    { code: "AUTH_NOT_CONFIGURED" },
    {
      headers: { "Cache-Control": "no-store" },
      status: 503,
    },
  );

async function getAuthenticatedUserId(request: Request): Promise<string | Response> {
  if (!getAuthReadinessForRuntime().isReady) {
    return authenticationUnavailableResponse();
  }

  const session = await getAuth().api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json(
      { code: "UNAUTHENTICATED" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 401,
      },
    );
  }

  return session.user.id;
}

export async function GET(request: Request): Promise<Response> {
  const researchCollectionPolicy = await getResearchCollectionPolicy();
  if (!isResearchCollectionReady(researchCollectionPolicy)) {
    return unavailableResponse();
  }

  const userId = await getAuthenticatedUserId(request);

  if (userId instanceof Response) {
    return userId;
  }

  const record = await env.DB.prepare(
    `SELECT consent_version, research_participation, ai_chat_upload_consent,
            data_notice_version, consented_at, withdrawn_at
       FROM consent_records
      WHERE user_id = ? AND consent_version = ?`,
  )
    .bind(userId, researchCollectionPolicy.consentVersion)
    .first();

  return Response.json(
    { consent: record ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return Response.json({ code: "CROSS_ORIGIN_REQUEST" }, { status: 403 });
  const researchCollectionPolicy = await getResearchCollectionPolicy();
  if (!isResearchCollectionReady(researchCollectionPolicy)) {
    return unavailableResponse();
  }

  const userId = await getAuthenticatedUserId(request);

  if (userId instanceof Response) {
    return userId;
  }
  if (!(await isWithinPlayerMutationLimit(userId, "research-consent", 12))) return Response.json({ code: "REQUEST_RATE_LIMITED" }, { status: 429 });

  const body = await readBoundedJson(request, 2048);

  const parsed = consentRecordInputSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ code: "INVALID_CONSENT" }, { status: 400 });
  }

  if (
    parsed.data.consentVersion !== researchCollectionPolicy.consentVersion ||
    parsed.data.dataNoticeVersion !== researchCollectionPolicy.dataNoticeVersion
  ) {
    return Response.json({ code: "CONSENT_VERSION_MISMATCH" }, { status: 409 });
  }

  await env.DB.prepare(
    `INSERT INTO consent_records (
       id, user_id, consent_version, research_participation,
       ai_chat_upload_consent, data_notice_version, withdrawn_at
     ) VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE NULL END)
     ON CONFLICT(user_id, consent_version) DO UPDATE SET
       research_participation = excluded.research_participation,
       ai_chat_upload_consent = excluded.ai_chat_upload_consent,
       data_notice_version = excluded.data_notice_version,
       consented_at = CURRENT_TIMESTAMP,
       withdrawn_at = excluded.withdrawn_at`,
  )
    .bind(
      crypto.randomUUID(),
      userId,
      parsed.data.consentVersion,
      Number(parsed.data.researchParticipation),
      Number(parsed.data.aiChatUploadConsent),
      parsed.data.dataNoticeVersion,
      Number(parsed.data.researchParticipation),
    )
    .run();

  return Response.json(
    { status: "saved" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
