import app from "vinext/server/fetch-handler";
import { DurableObject } from "cloudflare:workers";

import { cleanExpiredResearch } from "./lib/server/research-cleanup";
import { withSecurityHeaders } from "./lib/server/security-headers";
import { databaseBusyResponse, isRetryableD1Error } from "./lib/server/d1-overload";
import { AdmissionBusyError, isFinalizationRequest, RequestAdmission } from "./lib/server/request-admission";

type ApplicationWorker = {
  fetch(request: Request, env: CloudflareEnv, context: ExecutionContext): Promise<Response>;
};

const application = app as ApplicationWorker;

/** One active coordinator per Worker namespace, shared by every edge isolate. */
export class D1FinalizationCoordinator extends DurableObject<CloudflareEnv> {
  private admission = new RequestAdmission();

  async fetch(request: Request): Promise<Response> {
    if (!isFinalizationRequest(request)) return new Response(null, { status: 404 });
    try {
      return await this.admission.run(() => application.fetch(request, this.env, {
        waitUntil: this.ctx.waitUntil.bind(this.ctx),
        passThroughOnException() {},
      } as ExecutionContext));
    } catch (error) {
      if (!(error instanceof AdmissionBusyError)) throw error;
      return databaseBusyResponse();
    }
  }
}

// The revision feed contains only public questionnaire IDs. Cache it per edge
// location without cookies; never cache authenticated routes or error responses.
async function fetchApplication(request: Request, env: CloudflareEnv, context: ExecutionContext) {
  const url = new URL(request.url);
  const edgeCache = request.method === "GET" && url.pathname === "/api/questionnaires/revisions"
    && !url.search && typeof caches !== "undefined" ? (caches as CacheStorage & { default?: Cache }).default : undefined;
  if (!edgeCache) return application.fetch(request, env, context);
  const cacheKey = new Request(url.href);
  const hit = await edgeCache.match(cacheKey).catch(() => undefined);
  if (hit) return hit;
  const response = await application.fetch(request, env, context);
  if (response.ok && !response.headers.has("Set-Cookie") && response.headers.get("Cache-Control")?.startsWith("public,")) {
    context.waitUntil(edgeCache.put(cacheKey, response.clone()).catch(() => {}));
  }
  return response;
}

export default {
  async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
    try {
      if (isFinalizationRequest(request)) {
        const coordinator = env.D1_FINALIZATION.get(env.D1_FINALIZATION.idFromName("finalization-v1"), { locationHint: "apac" });
        return withSecurityHeaders(await coordinator.fetch(request), request);
      }
      return withSecurityHeaders(await fetchApplication(request, env, context), request);
    } catch (error) {
      if (!isRetryableD1Error(error)) throw error;
      console.warn("Transient D1 error at Worker boundary.");
      return withSecurityHeaders(databaseBusyResponse(), request);
    }
  },
  async scheduled(_controller: ScheduledController, env: CloudflareEnv) {
    await cleanExpiredResearch(env);
  },
};
