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

/** This object only hands out capacity permits. The request and its I/O stay in the Worker. */
export class D1FinalizationCoordinator extends DurableObject<CloudflareEnv> {
  private admission: RequestAdmission;
  private permits = new Map<string, { release: () => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    const diagnosticLimit = finalizeDiagnosticsEnabled(env) ? Number(Reflect.get(env, "FINALIZE_DIAGNOSTIC_LIMIT")) : NaN;
    this.admission = new RequestAdmission(Number.isInteger(diagnosticLimit) && diagnosticLimit >= 1 && diagnosticLimit <= 20 ? diagnosticLimit : 20);
  }

  private releasePermit(token: string) {
    const permit = this.permits.get(token);
    if (!permit) return;
    clearTimeout(permit.timer);
    this.permits.delete(token);
    permit.release();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.origin !== "https://finalization.internal") return new Response(null, { status: 404 });
    if (url.pathname === "/release") {
      this.releasePermit(url.searchParams.get("token") ?? "");
      return new Response(null, { status: 204 });
    }
    if (url.pathname !== "/acquire") return new Response(null, { status: 404 });
    const token = crypto.randomUUID();
    try {
      const release = await this.admission.reserve();
      const timer = setTimeout(() => this.releasePermit(token), 120_000);
      this.permits.set(token, { release, timer });
      return Response.json({ token });
    } catch (error) {
      if (error instanceof AdmissionBusyError) return databaseBusyResponse();
      throw error;
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
        let permit: string | undefined;
        let stage = "coordinator_acquire";
        const coordinator = () => env.D1_FINALIZATION.get(
          env.D1_FINALIZATION.idFromName("finalization-v2"), { locationHint: "apac" },
        );
        try {
          const admission = await coordinator().fetch("https://finalization.internal/acquire", { method: "POST" });
          if (!admission.ok) result = admission;
          else {
            const body = await admission.json<{ token: string }>();
            if (!/^[a-f0-9-]{36}$/.test(body.token)) throw new Error("Finalization permit is invalid");
            permit = body.token;
            stage = "worker_handler";
            if (finalizeDiagnosticsEnabled(env)) logFinalize(trace, "admitted", performance.now() - started);
            result = await application.fetch(new Request(request, { headers }), env, context);
          }
        } catch (error) {
          logFinalize(trace, stage, performance.now() - started, error);
          result = isRetryableD1Error(error) ? databaseBusyResponse() : Response.json(
            { code: "SUBMISSION_RESULT_UNKNOWN" }, { status: 500, headers: { "Cache-Control": "no-store" } },
          );
        } finally {
          if (permit) {
            const releaseUrl = `https://finalization.internal/release?token=${encodeURIComponent(permit)}`;
            context.waitUntil(Promise.resolve().then(() =>
              coordinator().fetch(releaseUrl, { method: "POST" }),
            ).then(response => response.body?.cancel()).catch(error => {
              logFinalize(trace, "coordinator_release", performance.now() - started, error);
            }));
          }
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
