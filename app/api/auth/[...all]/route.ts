import { toNextJsHandler } from "better-auth/next-js";
import { env } from "cloudflare:workers";

import { getAuth, getAuthReadinessForRuntime } from "../../../../lib/server/auth";
import { verifyTurnstileToken } from "../../../../lib/server/turnstile";

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

  const pathname = new URL(request.url).pathname;
  const isProtectedAuthRequest = request.method === "POST" && ["/api/auth/sign-in/email", "/api/auth/sign-up/email"].includes(pathname);
  const turnstileSecret = (env as CloudflareEnv & { TURNSTILE_SECRET_KEY?: string }).TURNSTILE_SECRET_KEY;

  if (isProtectedAuthRequest && turnstileSecret?.trim()) {
    const body = await request.clone().json().catch(() => null) as { turnstileToken?: unknown } | null;
    const verification = await verifyTurnstileToken({
      expectedAction: pathname.endsWith("/sign-up/email") ? "signup" : "login",
      remoteIp: request.headers.get("cf-connecting-ip") ?? undefined,
      secret: turnstileSecret,
      token: typeof body?.turnstileToken === "string" ? body.turnstileToken : undefined,
    });

    if (!verification.ok) {
      return Response.json(
        { code: verification.reason === "unavailable" ? "TURNSTILE_UNAVAILABLE" : "TURNSTILE_FAILED" },
        { headers: { "Cache-Control": "no-store" }, status: verification.reason === "unavailable" ? 503 : 403 },
      );
    }
  }

  return getAuth().handler(request);
}

export const { DELETE, GET, PATCH, POST, PUT } = toNextJsHandler(authHandler);
