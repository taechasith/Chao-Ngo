export class AdmissionBusyError extends Error {}

/** Bounded FIFO admission. A permit is released only after the handler finishes. */
export class RequestAdmission {
  private active = 0;
  private waiting: Array<{ cost: number; start: (release: () => void) => void; timer: ReturnType<typeof setTimeout> }> = [];

  constructor(private limit = 20, private maximumWaiting = 512, private timeoutMs = 60_000) {}

  private release(cost: number): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= cost;
      while (this.waiting.length && this.active + this.waiting[0].cost <= this.limit) {
        const next = this.waiting.shift()!;
        clearTimeout(next.timer);
        this.active += next.cost;
        next.start(this.release(next.cost));
      }
    };
  }

  acquire(cost = 1): Promise<() => void> {
    if (!Number.isInteger(cost) || cost < 1 || cost > this.limit) return Promise.reject(new AdmissionBusyError());
    if (!this.waiting.length && this.active + cost <= this.limit) {
      this.active += cost;
      return Promise.resolve(this.release(cost));
    }
    if (this.waiting.length >= this.maximumWaiting) return Promise.reject(new AdmissionBusyError());
    return new Promise((resolve, reject) => {
      const entry = {
        cost, start: resolve,
        timer: setTimeout(() => {
          const index = this.waiting.indexOf(entry);
          if (index !== -1) this.waiting.splice(index, 1);
          reject(new AdmissionBusyError());
          // A timed-out large upload must not strand smaller callers behind it.
          this.release(0)();
        }, this.timeoutMs),
      };
      this.waiting.push(entry);
    });
  }

  async run<T>(work: () => Promise<T>, cost = 1): Promise<T> {
    const release = await this.acquire(cost);
    try { return await work(); }
    finally { release(); }
  }
}

export const databaseRequestCapacity = 20;
export const uploadMemoryCapacity = 12;

export function isFinalizationRequest(request: Request): boolean {
  return request.method === "POST" && /^\/api\/submissions\/[^/]+\/finalize\/?$/.test(new URL(request.url).pathname);
}

export function isSubmissionUpload(request: Request): boolean {
  return request.method === "POST" && /^\/api\/submissions\/[^/]+\/uploads\/?$/.test(new URL(request.url).pathname);
}

/** Static assets bypass the gate; every API and rendered page shares the D1 budget. */
export function needsDatabaseAdmission(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return path.startsWith("/api/") || !/\.[a-z0-9]{1,8}$/i.test(path);
}

export function uploadAdmissionCost(request: Request): number {
  const bytes = Number(request.headers.get("Content-Length"));
  return Number.isSafeInteger(bytes) && bytes > 0
    ? Math.min(uploadMemoryCapacity, Math.max(1, Math.ceil(bytes / (2 * 1024 * 1024))))
    : uploadMemoryCapacity;
}

export function isUploadAdmissionRequest(request: Request): boolean {
  return request.method === "POST" && /^\/api\/submissions\/[^/]+\/uploads\/admission\/?$/.test(new URL(request.url).pathname);
}
