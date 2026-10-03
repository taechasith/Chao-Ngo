export type PendingAnswer = { questionId: string; sessionId: string; value: unknown; revision: number };
export type AnswerSaveResult = { ok: boolean; retryable?: boolean; message?: string };
export type AnswerSaveState = "idle" | "saving" | "saved" | "error";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const prefix = "chao-ngo:pending-answers:";

export function normalizeAnswer(value: unknown): unknown {
  return (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length) ? null : value;
}

/** One serialized writer per question. A successful old write never removes a newer edit. */
export class AnswerAutosave {
  private pending = new Map<string, PendingAnswer>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private flights = new Map<string, Promise<boolean>>();
  private disposed = false;
  private revision = 0;
  private failures = 0;
  private state: AnswerSaveState = "idle";
  private listeners = new Set<(state: AnswerSaveState, count: number) => void>();
  constructor(private options: {
    send: (answer: PendingAnswer, keepalive: boolean) => Promise<AnswerSaveResult>;
    storage?: () => Storage | undefined;
    delay?: number;
    onError?: (message: string) => void;
  }) {}

  subscribe(listener: (state: AnswerSaveState, count: number) => void) {
    this.listeners.add(listener);
    listener(this.state, this.pending.size);
    return () => { this.listeners.delete(listener); };
  }
  setErrorHandler(handler?: (message: string) => void) { this.options.onError = handler; }
  private notify(state: AnswerSaveState) {
    this.state = state;
    for (const listener of this.listeners) listener(state, this.pending.size);
  }
  private key(sessionId: string, questionId: string) { return `${sessionId}:${questionId}`; }
  private persist(sessionId: string) {
    try {
      const answers = [...this.pending.values()].filter(answer => answer.sessionId === sessionId);
      const storage = this.options.storage?.();
      if (answers.length) storage?.setItem(prefix + sessionId, JSON.stringify(answers));
      else storage?.removeItem(prefix + sessionId);
    } catch { /* The server save still works when browser storage is unavailable. */ }
  }
  restore(sessionId: string, questionIds: string[]): Record<string, unknown> {
    const restored: Record<string, unknown> = {};
    try {
      const raw: unknown = JSON.parse(this.options.storage?.()?.getItem(prefix + sessionId) ?? "[]");
      if (!Array.isArray(raw)) return restored;
      for (const item of raw) {
        if (!item || item.sessionId !== sessionId || !questionIds.includes(item.questionId)) continue;
        const answer: PendingAnswer = { sessionId, questionId: item.questionId, value: normalizeAnswer(item.value), revision: ++this.revision };
        this.pending.set(this.key(sessionId, answer.questionId), answer);
        restored[answer.questionId] = answer.value;
      }
    } catch { /* Corrupt or disabled session storage must not block opening a form. */ }
    if (this.pending.size) this.notify("saving");
    return restored;
  }
  enqueue(sessionId: string, questionId: string, value: unknown) {
    const key = this.key(sessionId, questionId);
    this.pending.set(key, { sessionId, questionId, value: normalizeAnswer(value), revision: ++this.revision });
    this.persist(sessionId);
    this.notify("saving");
    this.schedule(key, this.options.delay ?? 600);
  }
  private schedule(key: string, delay: number) {
    clearTimeout(this.timers.get(key));
    if (this.disposed) return;
    this.timers.set(key, setTimeout(() => { this.timers.delete(key); void this.write(key, false); }, delay));
  }
  private write(key: string, keepalive: boolean): Promise<boolean> {
    const existing = this.flights.get(key);
    if (existing) return existing.then(ok => ok && this.pending.has(key) ? this.write(key, keepalive) : ok);
    const answer = this.pending.get(key);
    if (!answer) return Promise.resolve(true);
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    const work = (async () => {
      let result: AnswerSaveResult;
      try { result = await this.options.send(answer, keepalive); }
      catch { result = { ok: false, retryable: true }; }
      if (result.ok) {
        if (this.pending.get(key)?.revision === answer.revision) this.pending.delete(key);
        this.persist(answer.sessionId);
        this.failures = 0;
        this.notify(this.pending.size ? "saving" : "saved");
      } else {
        this.notify("error");
        this.options.onError?.(result.message ?? "เครือข่ายขัดข้อง คำตอบยังค้างบันทึก ลองอีกครั้งเมื่อเชื่อมต่อได้");
        if (result.retryable) this.schedule(key, Math.min(30_000, 2_000 * 2 ** Math.min(this.failures++, 4)));
      }
      return result.ok;
    })().finally(() => { this.flights.delete(key); });
    this.flights.set(key, work);
    return work.then(ok => ok && this.pending.has(key) ? this.write(key, keepalive) : ok);
  }
  async flush(sessionId?: string, keepalive = false): Promise<boolean> {
    const keys = [...this.pending.entries()].filter(([, answer]) => !sessionId || answer.sessionId === sessionId).map(([key]) => key);
    const results = await Promise.all(keys.map(key => this.write(key, keepalive)));
    return results.every(Boolean);
  }
  forget(sessionId: string) {
    for (const [key, answer] of this.pending) if (answer.sessionId === sessionId) {
      clearTimeout(this.timers.get(key)); this.timers.delete(key); this.pending.delete(key);
    }
    this.persist(sessionId);
  }
  dispose() {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.listeners.clear();
    // Start requests now, before the component disappears; pending copies stay until acknowledged.
    void this.flush(undefined, true);
  }
  resume() { this.disposed = false; }
}
