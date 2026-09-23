import { env } from "cloudflare:workers";

import { requireResearchParticipant } from "../../../../../lib/server/research-access";
import { privateUploadKeyFor } from "../../../../../lib/server/storage/private-r2";
import { isSameOriginRequest } from "../../../../../lib/server/request-security";
import { hasPdfSignature, safePdfFilename } from "../../../../../lib/server/storage/pdf-validation";
import { aiChatUploadConsentVersion } from "../../../../../lib/server/research-consent-copy";
import { readBoundedBody } from "../../../../../lib/server/request-body";
import { isWithinPlayerMutationLimit } from "../../../../../lib/server/request-limits";
import { validateAnswerAttachment } from "../../../../../lib/server/submissions/answer-attachment";
import {
  getSubmissionRequirements,
  maximumPrivateUploadBytes,
} from "../../../../../lib/server/submissions/requirements";

export const dynamic = "force-dynamic";

const multipartOverheadBytes = 64 * 1024;
const maximumPdfBytes = maximumPrivateUploadBytes;
type RouteContext = { params: Promise<{ submissionId: string }> };
type UploadKind = "ai_chat_pdf" | "answer_attachment";

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store" }, status });
}

function uploadKindFromForm(form: FormData): UploadKind | null {
  const rawKind = form.get("kind");
  if (rawKind === null) return "ai_chat_pdf";
  return rawKind === "ai_chat_pdf" || rawKind === "answer_attachment" ? rawKind : null;
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  const copied = new Uint8Array(bytes.byteLength);
  copied.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", copied));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (!isSameOriginRequest(request)) return response({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const participant = await requireResearchParticipant(request);
  if (participant instanceof Response) return participant;
  if (!(await isWithinPlayerMutationLimit(participant.userId, "submission-upload", 12))) return response({ code: "REQUEST_RATE_LIMITED" }, 429);

  const { submissionId } = await context.params;
  const draft = await env.DB.prepare(
    "SELECT id, subgame_id FROM submissions WHERE id = ? AND user_id = ? AND status = 'draft'",
  ).bind(submissionId, participant.userId).first<{ id: string; subgame_id: string }>();
  if (!draft) return response({ code: "DRAFT_NOT_FOUND" }, 404);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumPrivateUploadBytes + multipartOverheadBytes) return response({ code: "PDF_SIZE_INVALID" }, 413);

  const body = await readBoundedBody(request, maximumPrivateUploadBytes + multipartOverheadBytes);
  if (!body) return response({ code: "PDF_SIZE_INVALID" }, 413);
  const form = await new Response(body as BodyInit, {
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
  }).formData().catch(() => null);
  if (!form) return response({ code: "UPLOAD_FORM_INVALID" }, 400);

  const kind = uploadKindFromForm(form);
  if (!kind) return response({ code: "UPLOAD_KIND_INVALID" }, 400);
  const formFile = form.get("file");
  if (!(formFile instanceof File)) return response({ code: kind === "ai_chat_pdf" ? "PDF_REQUIRED" : "ANSWER_ATTACHMENT_REQUIRED" }, 400);

  const requirements = await getSubmissionRequirements(env.DB, draft.subgame_id);
  const bucket = env.PRIVATE_UPLOADS;
  if (!bucket) return response({ code: "PRIVATE_STORAGE_UNAVAILABLE" }, 503);

  if (kind === "ai_chat_pdf") {
    if (!requirements.requiresAiChatPdf) return response({ code: "AI_CHAT_PDF_NOT_REQUIRED" }, 409);

    const acknowledgement = await env.DB.prepare(
      "SELECT id FROM submission_consent_acknowledgements WHERE submission_id = ? AND user_id = ? AND consent_version = ?",
    ).bind(submissionId, participant.userId, aiChatUploadConsentVersion).first<{ id: string }>();
    if (!acknowledgement) return response({ code: "ACKNOWLEDGEMENT_REQUIRED" }, 403);
    if (formFile.size < 12 || formFile.size > maximumPdfBytes) return response({ code: "PDF_SIZE_INVALID" }, 413);
    if (!formFile.name.toLowerCase().endsWith(".pdf") || formFile.type !== "application/pdf") {
      return response({ code: "PDF_TYPE_INVALID" }, 400);
    }

    const bytes = new Uint8Array(await formFile.arrayBuffer());
    if (!hasPdfSignature(bytes)) return response({ code: "PDF_SIGNATURE_INVALID" }, 400);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM uploads WHERE submission_id = ? AND user_id = ? AND kind = 'ai_chat_pdf'",
    ).bind(submissionId, participant.userId).first<{ count: number }>();
    if ((count?.count ?? 0) >= 3) return response({ code: "UPLOAD_LIMIT_REACHED" }, 429);

    const uploadId = crypto.randomUUID();
    const originalName = safePdfFilename(formFile.name);
    const key = privateUploadKeyFor({ submissionId, uploadId, userId: participant.userId });

    try {
      await bucket.put(key, bytes, {
        httpMetadata: { cacheControl: "private, no-store", contentType: "application/pdf" },
      });
    } catch {
      return response({ code: "PRIVATE_STORAGE_UNAVAILABLE" }, 503);
    }

    try {
      const result = await env.DB.prepare(
        `INSERT INTO uploads (
           id, submission_id, user_id, kind, private_r2_key, original_name, stored_name,
           bytes, mime_declared, mime_detected, sha256, status, uploaded_at
         ) SELECT ?, ?, ?, 'ai_chat_pdf', ?, ?, ?, ?, ?, 'application/pdf', ?, 'uploaded', CURRENT_TIMESTAMP
           WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND user_id = ? AND status = 'draft')
             AND EXISTS (SELECT 1 FROM submission_consent_acknowledgements
               WHERE submission_id = ? AND user_id = ? AND consent_version = ?)
             AND EXISTS (SELECT 1 FROM consent_records WHERE user_id = ? AND consent_version = ?
               AND research_participation = 1 AND withdrawn_at IS NULL)
             AND (SELECT COUNT(*) FROM uploads WHERE submission_id = ? AND kind = 'ai_chat_pdf') < 3`,
      ).bind(
        uploadId,
        submissionId,
        participant.userId,
        key,
        originalName,
        `${uploadId}.pdf`,
        bytes.byteLength,
        formFile.type.slice(0, 100) || "application/pdf",
        await digestHex(bytes),
        submissionId, participant.userId,
        submissionId, participant.userId, aiChatUploadConsentVersion,
        participant.userId, participant.consentVersion,
        submissionId,
      ).run();
      if (!result.meta.changes) {
        await bucket.delete(key);
        return response({ code: "SUBMISSION_CHANGED" }, 409);
      }
      await env.DB.prepare(
        `INSERT INTO activity_events (id, event_id, user_id, event_type, payload_json)
         VALUES (?, ?, ?, 'ai_pdf_upload_completed', '{}')`,
      ).bind(crypto.randomUUID(), `upload:${uploadId}`, participant.userId).run();
    } catch (error) {
      const saved = await env.DB.prepare("SELECT id FROM uploads WHERE id = ?").bind(uploadId).first();
      if (!saved) await bucket.delete(key);
      throw error;
    }

    return response({ upload: { bytes: bytes.byteLength, id: uploadId, kind, name: originalName, status: "uploaded" } }, 201);
  }

  if (!requirements.requiresAnswerTextOrAttachment || !requirements.allowedAnswerAttachmentExtensions.length) {
    return response({ code: "ANSWER_ATTACHMENT_NOT_ALLOWED" }, 409);
  }
  if (/^(?:text\/html|application\/xhtml\+xml)$/i.test(formFile.type)) {
    return response({ code: "ANSWER_ATTACHMENT_TYPE_INVALID" }, 400);
  }

  const bytes = new Uint8Array(await formFile.arrayBuffer());
  const validation = validateAnswerAttachment({ bytes, filename: formFile.name, requirements });
  if (!validation.success) return response({ code: validation.code }, validation.code === "ANSWER_ATTACHMENT_SIZE_INVALID" ? 413 : 400);

  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM uploads WHERE submission_id = ? AND user_id = ? AND kind = 'answer_attachment'",
  ).bind(submissionId, participant.userId).first<{ count: number }>();
  if ((count?.count ?? 0) >= 1) return response({ code: "UPLOAD_LIMIT_REACHED" }, 429);

  const uploadId = crypto.randomUUID();
  const key = privateUploadKeyFor({
    extension: validation.extension,
    submissionId,
    uploadId,
    userId: participant.userId,
  });

  try {
    await bucket.put(key, bytes, {
      httpMetadata: { cacheControl: "private, no-store", contentType: validation.detectedMime },
    });
  } catch {
    return response({ code: "PRIVATE_STORAGE_UNAVAILABLE" }, 503);
  }

  try {
    const result = await env.DB.prepare(
      `INSERT INTO uploads (
         id, submission_id, user_id, kind, private_r2_key, original_name, stored_name,
         bytes, mime_declared, mime_detected, sha256, status, uploaded_at
       ) SELECT ?, ?, ?, 'answer_attachment', ?, ?, ?, ?, ?, ?, ?, 'uploaded', CURRENT_TIMESTAMP
         WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND user_id = ? AND status = 'draft')
           AND EXISTS (SELECT 1 FROM consent_records WHERE user_id = ? AND consent_version = ?
             AND research_participation = 1 AND withdrawn_at IS NULL)
           AND (SELECT COUNT(*) FROM uploads WHERE submission_id = ? AND kind = 'answer_attachment') < 1`,
    ).bind(
      uploadId,
      submissionId,
      participant.userId,
      key,
      validation.originalName,
      `${uploadId}.${validation.extension}`,
      bytes.byteLength,
      formFile.type.slice(0, 100) || validation.detectedMime,
      validation.detectedMime,
      await digestHex(bytes),
      submissionId, participant.userId,
      participant.userId, participant.consentVersion,
      submissionId,
    ).run();
    if (!result.meta.changes) {
      await bucket.delete(key);
      return response({ code: "SUBMISSION_CHANGED" }, 409);
    }
    await env.DB.prepare(
      `INSERT INTO activity_events (id, event_id, user_id, event_type, subgame_id, payload_json)
       VALUES (?, ?, ?, 'submission_draft_saved', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      `upload:${uploadId}`,
      participant.userId,
      draft.subgame_id,
      JSON.stringify({ attachment: "answer", instrumentVersion: requirements.instrumentVersion }),
    ).run();
  } catch (error) {
    const saved = await env.DB.prepare("SELECT id FROM uploads WHERE id = ?").bind(uploadId).first();
    if (!saved) await bucket.delete(key);
    throw error;
  }

  return response({
    upload: {
      bytes: bytes.byteLength,
      id: uploadId,
      kind,
      name: validation.originalName,
      status: "uploaded",
    },
  }, 201);
}
