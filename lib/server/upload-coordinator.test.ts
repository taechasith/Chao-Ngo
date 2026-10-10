import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handler = vi.hoisted(() => vi.fn());
vi.mock("vinext/server/fetch-handler", () => ({ default: { fetch: handler } }));
vi.mock("cloudflare:workers", () => ({
  env: {},
  DurableObject: class {
    constructor(public ctx: DurableObjectState, public env: CloudflareEnv) {}
  },
}));
import { D1FinalizationCoordinator } from "../../worker";

let sql: DatabaseSync;
let coordinator: D1FinalizationCoordinator;
async function start() {
  let ready: Promise<unknown> | undefined;
  const ctx = {
    storage: { sql: { exec: (query: string, ...values: (string | number | null)[]) => {
      const statement = sql.prepare(query);
      const rows = /^SELECT/i.test(query) ? statement.all(...values) : (statement.run(...values), []);
      return { [Symbol.iterator]: () => rows[Symbol.iterator](), toArray: () => rows };
    } } },
    blockConcurrencyWhile: (callback: () => Promise<unknown>) => { ready = callback(); return ready; },
    waitUntil() {},
  } as unknown as DurableObjectState;
  coordinator = new D1FinalizationCoordinator(ctx, {} as CloudflareEnv);
  await ready;
}
const megabytes = 1024 * 1024;
const reserve = async (bytes: number, submissionId = "draft") => coordinator.fetch(new Request(`https://example.test/api/submissions/${submissionId}/uploads/admission`, {
  method: "POST", body: JSON.stringify({ bytes, submissionId }),
}));
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
  sql = new DatabaseSync(":memory:");
  handler.mockReset().mockImplementation(async (request: Request) => {
    const input = await request.json() as { bytes: number; submissionId: string };
    return Response.json({ admission: { bytes: input.bytes, submissionId: input.submissionId } });
  });
  await start();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); sql.close(); });
describe("persisted upload memory admission", () => {
  it("holds the file budget past the reservation expiry while a slow upload is active", async () => {
    const { permit } = await (await reserve(20 * megabytes)).json() as { permit: string };
    let finishUpload!: (response: Response) => void;
    handler.mockImplementationOnce(() => new Promise<Response>(resolve => { finishUpload = resolve; }));
    const active = coordinator.fetch(new Request("https://example.test/api/submissions/draft/uploads", {
      method: "POST", headers: { "X-Upload-Permit": permit, "Content-Length": String(20 * megabytes) }, body: "slow body",
    }));
    let nextGranted = false;
    const next = reserve(2 * megabytes, "next").then(response => { nextGranted = true; return response; });
    await vi.advanceTimersByTimeAsync(120_001);
    expect(nextGranted).toBe(false);
    finishUpload(Response.json({ upload: { id: "stored" } }, { status: 201 }));
    expect((await active).status).toBe(201);
    expect((await next).status).toBe(200);
    expect(nextGranted).toBe(true);
  });
  it("frees an unclaimed reservation after its deadline", async () => {
    await reserve(20 * megabytes);
    const next = reserve(2 * megabytes, "next");
    await vi.advanceTimersByTimeAsync(120_001);
    expect((await next).status).toBe(200);
  });
  it("restores unclaimed permits after a restart without oversubscribing", async () => {
    await reserve(20 * megabytes);
    await start();
    let granted = false;
    const next = reserve(2 * megabytes, "next").then(response => { granted = true; return response; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(granted).toBe(false);
    await vi.advanceTimersByTimeAsync(110_001);
    expect((await next).status).toBe(200);
  });
  it("removes a claimed reservation on restart because its old upload is no longer running", async () => {
    const { permit } = await (await reserve(20 * megabytes)).json() as { permit: string };
    sql.prepare("UPDATE upload_leases SET claimed=1 WHERE id=?").run(permit);
    await start();
    expect((await reserve(2 * megabytes, "next")).status).toBe(200);
    expect(sql.prepare("SELECT id FROM upload_leases WHERE id=?").get(permit)).toBeUndefined();
  });
});
