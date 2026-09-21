import { toNextJsHandler } from "better-auth/next-js";

import { getAuth, getAuthReadinessForRuntime } from "../../../../lib/server/auth";

export const dynamic = "force-dynamic";

async function authHandler(request: Request): Promise<Response> {
  if (!getAuthReadinessForRuntime().isReady) {
    return Response.json(
      { code: "AUTH_NOT_CONFIGURED" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 503,
      },
    );
  }

  return getAuth().handler(request);
}

export const { DELETE, GET, PATCH, POST, PUT } = toNextJsHandler(authHandler);
