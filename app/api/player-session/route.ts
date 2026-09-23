import { getAuth, getAuthReadinessForRuntime } from "../../../lib/server/auth";

export const dynamic = "force-dynamic";

type SessionState = "signed-in" | "signed-out" | "unavailable";

function response(state: SessionState): Response {
  return Response.json(
    { state },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * This is deliberately separate from Better Auth's own route.  It gives the
 * player shell a harmless, cache-free availability signal while local D1 is
 * not yet attached; protected routes still fail closed through research-access.
 */
export async function GET(request: Request): Promise<Response> {
  if (!getAuthReadinessForRuntime().isReady) return response("unavailable");

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    return response(session?.user?.id ? "signed-in" : "signed-out");
  } catch {
    return response("unavailable");
  }
}
