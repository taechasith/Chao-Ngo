import app from "vinext/server/fetch-handler";
import { DurableObject } from "cloudflare:workers";

import { processCompletionJobs } from "./lib/server/completion-jobs";
import { finalizeDiagnosticsEnabled, logFinalize } from "./lib/server/finalize-diagnostics";
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
  private admission: RequestAdmission;

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    const diagnosticLimit = finalizeDiagnosticsEnabled(env) ? Number(Reflect.get(env, "FINALIZE_DIAGNOSTIC_LIMIT")) : NaN;
    this.admission = new RequestAdmission(Number.isInteger(diagnosticLimit) && diagnosticLimit >= 1 && diagnosticLimit <= 20 ? diagnosticLimit : 20);
  }

  async fetch(request: Request): Promise<Response> {
    if (!isFinalizationRequest(request)) return new Response(null, { status: 404 });
    const trace = request.headers.get("x-finalize-trace") ?? "";
    const started = performance.now();
    let stage = "queue";
    try {
      return await this.admission.run(() => {
        stage = "handler";
        if (finalizeDiagnosticsEnabled(this.env)) logFinalize(trace, "admitted", performance.now() - started);
        return application.fetch(request, this.env, {
          waitUntil: this.ctx.waitUntil.bind(this.ctx),
          passThroughOnException() {},
        } as ExecutionContext);
      });
    } catch (error) {
      if (!(error instanceof AdmissionBusyError)) {
        logFinalize(trace, stage, performance.now() - started, error);
        throw error;
      }
      if (finalizeDiagnosticsEnabled(this.env)) logFinalize(trace, "queue_full_or_expired", performance.now() - started);
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
        const trace = crypto.randomUUID();
        const started = performance.now();
        const headers = new Headers(request.headers);
        headers.set("x-finalize-trace", trace);
        let result: Response;
        try {
          const coordinator = env.D1_FINALIZATION.get(env.D1_FINALIZATION.idFromName("finalization-v1"), { locationHint: "apac" });
          result = await coordinator.fetch(new Request(request, { headers }));
        } catch (error) {
          logFinalize(trace, "coordinator_rpc", performance.now() - started, error);
          result = isRetryableD1Error(error) ? databaseBusyResponse() : Response.json(
            { code: "SUBMISSION_RESULT_UNKNOWN" }, { status: 500, headers: { "Cache-Control": "no-store" } },
          );
        }
        const response = withSecurityHeaders(result, request);
        response.headers.set("x-finalize-trace", trace);
        if (finalizeDiagnosticsEnabled(env)) logFinalize(trace, `worker:http_${response.status}`, performance.now() - started);
        return response;
      }
      return withSecurityHeaders(await fetchApplication(request, env, context), request);
    } catch (error) {
      if (!isRetryableD1Error(error)) throw error;
      console.warn("Transient D1 error at Worker boundary.");
      return withSecurityHeaders(databaseBusyResponse(), request);
    }
  },
  async scheduled(controller: ScheduledController, env: CloudflareEnv) {
    if (controller.cron === "* * * * *") await processCompletionJobs(env.DB);
    else await cleanExpiredResearch(env);
  },
};
