import app from "vinext/server/fetch-handler";
import { DurableObject } from "cloudflare:workers";

import { cleanExpiredResearch } from "./lib/server/research-cleanup";
import { withSecurityHeaders } from "./lib/server/security-headers";
import { databaseBusyResponse } from "./lib/server/d1-overload";
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

export default {
  async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
    if (isFinalizationRequest(request)) {
      const coordinator = env.D1_FINALIZATION.get(env.D1_FINALIZATION.idFromName("finalization-v1"), { locationHint: "apac" });
      return withSecurityHeaders(await coordinator.fetch(request), request);
    }
    return withSecurityHeaders(await application.fetch(request, env, context), request);
  },
  async scheduled(_controller: ScheduledController, env: CloudflareEnv) {
    await cleanExpiredResearch(env);
  },
};
