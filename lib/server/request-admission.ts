export class AdmissionBusyError extends Error {}

/** FIFO admission, not a background job queue: callers await their committed result. */
export class RequestAdmission {
  private active = 0;
  private waiting: Array<{ start: () => void; timer: ReturnType<typeof setTimeout> }> = [];

  constructor(private limit = 12, private maximumWaiting = 512, private timeoutMs = 30_000) {}

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    if (this.waiting.length >= this.maximumWaiting) return Promise.reject(new AdmissionBusyError());
    return new Promise((resolve, reject) => {
      const entry = {
        start: resolve,
        timer: setTimeout(() => {
          const index = this.waiting.indexOf(entry);
          if (index !== -1) this.waiting.splice(index, 1);
          reject(new AdmissionBusyError());
        }, this.timeoutMs),
      };
      this.waiting.push(entry);
    });
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try { return await work(); }
    finally {
      const next = this.waiting.shift();
      if (next) { clearTimeout(next.timer); next.start(); }
      else this.active--;
    }
  }
}

export function isFinalizationRequest(request: Request): boolean {
  return request.method === "POST" && /^\/api\/submissions\/[^/]+\/finalize\/?$/.test(new URL(request.url).pathname);
}
