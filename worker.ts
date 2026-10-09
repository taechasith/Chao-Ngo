import app from "vinext/server/fetch-handler";
import { DurableObject } from "cloudflare:workers";

import { cleanExpiredResearch } from "./lib/server/research-cleanup";
import { withSecurityHeaders } from "./lib/server/security-headers";
import { databaseBusyResponse, isRetryableD1Error } from "./lib/server/d1-overload";
import { AdmissionBusyError, databaseRequestCapacity, isSubmissionUpload, isUploadAdmissionRequest, needsDatabaseAdmission, RequestAdmission, uploadAdmissionCost } from "./lib/server/request-admission";

type ApplicationWorker = {
  fetch(request: Request, env: CloudflareEnv, context: ExecutionContext): Promise<Response>;
};
const application = app as ApplicationWorker;
const internalOrigin = "https://admission.internal";

/** The existing binding/class is retained so deployments do not create a second queue. */
export class D1FinalizationCoordinator extends DurableObject<CloudflareEnv> {
  private admission = new RequestAdmission(databaseRequestCapacity, 1024);
  private fileAdmission = new RequestAdmission(databaseRequestCapacity, 512, 120_000);
  private leases = new Map<string, { release: () => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS upload_leases (id TEXT PRIMARY KEY, cost INTEGER NOT NULL, expires INTEGER NOT NULL, submission_id TEXT NOT NULL, bytes INTEGER NOT NULL, claimed INTEGER NOT NULL DEFAULT 0)");
      ctx.storage.sql.exec("DELETE FROM upload_leases WHERE expires <= ?", Date.now());
      // Upload bodies stay at the edge. Persist small permits so a restart cannot oversubscribe them.
      for (const row of ctx.storage.sql.exec<{ id: string; cost: number; expires: number }>("SELECT id,cost,expires FROM upload_leases")) {
        const releaseFile = await this.fileAdmission.acquire(row.cost);
        const releaseDatabase = await this.admission.acquire();
        this.trackLease(row.id, () => { releaseDatabase(); releaseFile(); }, row.expires);
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
        if (url.pathname === "/claim") {
          const id = url.searchParams.get("id"), submissionId = url.searchParams.get("submissionId");
          const length = Number(url.searchParams.get("length"));
          const row = this.ctx.storage.sql.exec<{ bytes: number; claimed: number; expires: number; submission_id: string }>(
            "SELECT bytes,claimed,expires,submission_id FROM upload_leases WHERE id=?", id).toArray()[0];
          if (!row || row.claimed || row.expires <= Date.now() || row.submission_id !== submissionId) {
            return Response.json({ code: "UPLOAD_ADMISSION_EXPIRED" }, { status: 409 });
          }
          if (!Number.isSafeInteger(length) || length < row.bytes || length > row.bytes + 64 * 1024) {
            return Response.json({ code: "UPLOAD_LENGTH_INVALID" }, { status: 413 });
          }
          this.ctx.storage.sql.exec("UPDATE upload_leases SET claimed=1 WHERE id=?", id);
          return Response.json({ id });
        }
        return new Response(null, { status: 404 });
      }
      if (isUploadAdmissionRequest(request)) {
        const preflight = await this.admission.run(() => application.fetch(request, this.env, {
          waitUntil: this.ctx.waitUntil.bind(this.ctx), passThroughOnException() {},
        } as ExecutionContext));
        if (!preflight.ok) return preflight;
        const { admission } = await preflight.json() as { admission: { bytes: number; submissionId: string } };
        // Wait on a bodyless request. Pending files remain in the player's browser.
        // Memory admission has its own queue so PDF waiters cannot strand session/polling calls.
        const cost = uploadAdmissionCost(new Request(request.url, { headers: { "Content-Length": String(admission.bytes + 64 * 1024) } }));
        const releaseFile = await this.fileAdmission.acquire(cost);
        let releaseDatabase: (() => void) | undefined;
        try {
          releaseDatabase = await this.admission.acquire();
          const id = crypto.randomUUID(), expires = Date.now() + 120_000;
          this.ctx.storage.sql.exec("INSERT INTO upload_leases(id,cost,expires,submission_id,bytes) VALUES (?,?,?,?,?)", id, cost, expires, admission.submissionId, admission.bytes);
          const release = releaseDatabase;
          this.trackLease(id, () => { release(); releaseFile(); }, expires);
          return Response.json({ permit: id }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) { releaseDatabase?.(); releaseFile(); throw error; }
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
      const id = request.headers.get("X-Upload-Permit");
      if (!id || !/^[a-f0-9-]{36}$/.test(id)) return withSecurityHeaders(Response.json({ code: "UPLOAD_ADMISSION_REQUIRED" }, { status: 428 }), request);
      const submissionId = new URL(request.url).pathname.split("/")[3];
      const permission = await coordinator.fetch(new Request(`${internalOrigin}/claim?id=${id}&submissionId=${submissionId}&length=${request.headers.get("Content-Length") ?? "0"}`, { method: "POST" }));
      if (!permission.ok) return withSecurityHeaders(permission, request);
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
