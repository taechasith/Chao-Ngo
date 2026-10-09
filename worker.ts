import app from "vinext/server/fetch-handler";
import { DurableObject } from "cloudflare:workers";

import { cleanExpiredResearch } from "./lib/server/research-cleanup";
import { withSecurityHeaders } from "./lib/server/security-headers";
import { databaseBusyResponse, isRetryableD1Error } from "./lib/server/d1-overload";
import { AdmissionBusyError, databaseRequestCapacity, isSubmissionUpload, needsDatabaseAdmission, RequestAdmission, uploadAdmissionCost } from "./lib/server/request-admission";

type ApplicationWorker = {
  fetch(request: Request, env: CloudflareEnv, context: ExecutionContext): Promise<Response>;
};
const application = app as ApplicationWorker;
const internalOrigin = "https://admission.internal";

/** The existing binding/class is retained so deployments do not create a second queue. */
export class D1FinalizationCoordinator extends DurableObject<CloudflareEnv> {
  private admission = new RequestAdmission(databaseRequestCapacity, 1024);
  private leases = new Map<string, { release: () => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS upload_leases (id TEXT PRIMARY KEY, cost INTEGER NOT NULL, expires INTEGER NOT NULL)");
      ctx.storage.sql.exec("DELETE FROM upload_leases WHERE expires <= ?", Date.now());
      // Upload bodies stay at the edge. Persist small permits so a restart cannot oversubscribe them.
      for (const row of ctx.storage.sql.exec<{ id: string; cost: number; expires: number }>("SELECT id,cost,expires FROM upload_leases")) {
        const release = await this.admission.acquire(row.cost);
        this.trackLease(row.id, release, row.expires);
      }
    });
  }

  private trackLease(id: string, release: () => void, expires: number) {
    this.leases.set(id, { release, timer: setTimeout(() => this.releaseLease(id), Math.max(1, expires - Date.now())) });
  }

  private releaseLease(id: string) {
    const lease = this.leases.get(id);
    if (!lease) return;
    this.ctx.storage.sql.exec("DELETE FROM upload_leases WHERE id=?", id);
    clearTimeout(lease.timer);
    this.leases.delete(id);
    lease.release();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.origin === internalOrigin) {
        if (request.method !== "POST") return new Response(null, { status: 405 });
        if (url.pathname === "/release") {
          this.releaseLease(url.searchParams.get("id") ?? "");
          return new Response(null, { status: 204 });
        }
        if (url.pathname === "/cleanup") {
          return await this.admission.run(async () => Response.json(await cleanExpiredResearch(this.env)), databaseRequestCapacity);
        }
        if (url.pathname !== "/acquire") return new Response(null, { status: 404 });
        const cost = Number(url.searchParams.get("cost"));
        const release = await this.admission.acquire(cost);
        const id = crypto.randomUUID(), expires = Date.now() + 120_000;
        try {
          this.ctx.storage.sql.exec("INSERT INTO upload_leases(id,cost,expires) VALUES (?,?,?)", id, cost, expires);
          this.trackLease(id, release, expires);
          return Response.json({ id });
        } catch (error) { release(); throw error; }
      }
      return await this.admission.run(() => application.fetch(request, this.env, {
        waitUntil: this.ctx.waitUntil.bind(this.ctx), passThroughOnException() {},
      } as ExecutionContext));
    } catch (error) {
      if (error instanceof AdmissionBusyError || isRetryableD1Error(error)) return databaseBusyResponse();
      throw error;
    }
  }
}

export default {
  async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
    try {
      if (!needsDatabaseAdmission(request)) return withSecurityHeaders(await application.fetch(request, env, context), request);
      const coordinator = env.D1_FINALIZATION.get(env.D1_FINALIZATION.idFromName("finalization-v1"), { locationHint: "apac" });
      if (!isSubmissionUpload(request)) return withSecurityHeaders(await coordinator.fetch(request), request);
      const permission = await coordinator.fetch(new Request(`${internalOrigin}/acquire?cost=${uploadAdmissionCost(request)}`, { method: "POST" }));
      if (!permission.ok) return withSecurityHeaders(databaseBusyResponse(), request);
      const { id } = await permission.json() as { id: string };
      try { return withSecurityHeaders(await application.fetch(request, env, context), request); }
      finally {
        context.waitUntil(coordinator.fetch(new Request(`${internalOrigin}/release?id=${id}`, { method: "POST" })).then(() => {}).catch(() => {
          console.warn("Upload admission release failed; bounded lease will expire");
        }));
      }
    } catch (error) {
      if (isRetryableD1Error(error)) return withSecurityHeaders(databaseBusyResponse(), request);
      throw error;
    }
  },
  async scheduled(_controller: ScheduledController, env: CloudflareEnv) {
    const coordinator = env.D1_FINALIZATION.get(env.D1_FINALIZATION.idFromName("finalization-v1"), { locationHint: "apac" });
    const response = await coordinator.fetch(new Request(`${internalOrigin}/cleanup`, { method: "POST" }));
    if (!response.ok) throw new Error("Scheduled cleanup could not acquire the database budget; next schedule will retry.");
  },
};
