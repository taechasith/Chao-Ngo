import { env } from "cloudflare:workers";
import { getAuth, getAuthReadinessForRuntime } from "../../../lib/server/auth";
import { isSameOriginRequest } from "../../../lib/server/request-security";
import { decodeAvatar, profileUpdateSchema } from "../../../lib/server/profile-validation";
import { avatarKey, avatarUrl } from "../../../lib/server/profile-avatar";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function currentUser(request: Request) {
  if (!getAuthReadinessForRuntime().isReady) return null;
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

export async function GET(request: Request) {
  const id = await currentUser(request);
  if (!id) return json({ code: "UNAUTHENTICATED" }, 401);
  const user = await env.DB.prepare('SELECT name, email, image, createdAt FROM "user" WHERE id = ?').bind(id).first();
  return user ? json({ user }) : json({ code: "UNAUTHENTICATED" }, 401);
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return json({ code: "CROSS_ORIGIN_REQUEST" }, 403);
  const id = await currentUser(request);
  if (!id) return json({ code: "UNAUTHENTICATED" }, 401);
  // Bound the stream before parsing, including chunked requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return json({ code: "INVALID_PROFILE" }, 400);
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 140000) { await reader.cancel(); return json({ code: "PROFILE_TOO_LARGE" }, 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ code: "INVALID_PROFILE" }, 400); }
  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) return json({ code: "INVALID_PROFILE" }, 400);
  const { name, image } = parsed.data;
  if (image === undefined) await env.DB.prepare('UPDATE "user" SET name = ?, updatedAt = ? WHERE id = ?').bind(name, Date.now(), id).run();
  else {
    const previous = await env.DB.prepare('SELECT image FROM "user" WHERE id = ?').bind(id).first<{ image: string | null }>();
    const nextUrl = image ? avatarUrl(crypto.randomUUID()) : null;
    const nextKey = avatarKey(id, nextUrl);
    try {
      if (image && nextKey) {
        const avatar = decodeAvatar(image)!;
        await env.PRIVATE_UPLOADS.put(nextKey, avatar.bytes, { httpMetadata: { contentType: avatar.contentType } });
      }
      await env.DB.prepare('UPDATE "user" SET name = ?, image = ?, updatedAt = ? WHERE id = ?').bind(name, nextUrl, Date.now(), id).run();
    } catch {
      if (nextKey) await env.PRIVATE_UPLOADS.delete(nextKey).catch(() => undefined);
      return json({ code: "PROFILE_SAVE_FAILED" }, 503);
    }
    const previousKey = avatarKey(id, previous?.image);
    if (previousKey) await env.PRIVATE_UPLOADS.delete(previousKey).catch(() => undefined);
  }
  const user = await env.DB.prepare('SELECT name, email, image, createdAt FROM "user" WHERE id = ?').bind(id).first();
  return json({ ok: true, user });
}
