import { env } from "cloudflare:workers";
import { getAuth, getAuthReadinessForRuntime } from "../../../../lib/server/auth";
import { avatarKey, avatarUrl } from "../../../../lib/server/profile-avatar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!getAuthReadinessForRuntime().isReady) return new Response(null, { status: 401, headers });
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return new Response(null, { status: 401, headers });
  const user = await env.DB.prepare('SELECT image FROM "user" WHERE id = ?').bind(session.user.id).first<{ image: string | null }>();
  const requestedUrl = avatarUrl(new URL(request.url).searchParams.get("v") ?? "");
  const key = user?.image === requestedUrl ? avatarKey(session.user.id, user.image) : null;
  if (!key) return new Response(null, { status: 404, headers });
  const object = await env.PRIVATE_UPLOADS.get(key);
  if (!object) return new Response(null, { status: 404, headers });
  return new Response(object.body, { headers: { ...headers, "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream" } });
}
