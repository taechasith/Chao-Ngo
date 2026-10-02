import { toNextJsHandler } from "better-auth/next-js";
import { env } from "cloudflare:workers";

import { isLocalAuthDestination } from "../../../../lib/auth-navigation";
import { getAuth, getAuthReadinessForRuntime, getGoogleAuthConfigurationForRuntime } from "../../../../lib/server/auth";
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
  const isProtectedAuthRequest = request.method === "POST" && pathname === "/api/auth/sign-in/social";
  if (isProtectedAuthRequest) {
    // OAuth initiation is a browser action: also protect the first visit before a session cookie exists.
    if (request.headers.get("Origin") !== new URL(request.url).origin) return Response.json({ code: "INVALID_ORIGIN" }, { headers: { "Cache-Control": "no-store" }, status: 403 });
    if (!getGoogleAuthConfigurationForRuntime()) return Response.json({ code: "GOOGLE_AUTH_NOT_CONFIGURED" }, { headers: { "Cache-Control": "no-store" }, status: 503 });
    const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
    // This website supports Google's code flow with only its basic identity scopes.
    if (!body || body.provider !== "google" || body.idToken || body.scopes || body.additionalParams) return Response.json({ code: "UNSUPPORTED_SIGN_IN" }, { headers: { "Cache-Control": "no-store" }, status: 400 });
    for (const field of ["callbackURL", "newUserCallbackURL", "errorCallbackURL"]) {
      if (body[field] !== undefined && !isLocalAuthDestination(body[field])) return Response.json({ code: "INVALID_CALLBACK" }, { headers: { "Cache-Control": "no-store" }, status: 403 });
    }
  }
  const turnstileSecret = (env as CloudflareEnv & { TURNSTILE_SECRET_KEY?: string }).TURNSTILE_SECRET_KEY;

  if (isProtectedAuthRequest && turnstileSecret?.trim()) {
    const body = await request.clone().json().catch(() => null) as { turnstileToken?: unknown } | null;
    const verification = await verifyTurnstileToken({
      expectedAction: "login",
      expectedHostname: new URL(request.url).hostname,
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
