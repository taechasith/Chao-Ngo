import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerAutosave, normalizeAnswer } from "./answer-autosave";

afterEach(() => vi.useRealTimers());
function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }, data };
}

describe("answers survive navigation, clearing and a failed connection", () => {
  it("flushes a pending edit on unmount before the debounce ends", async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => ({ ok: true }));
    const saver = new AnswerAutosave({ send });
    saver.enqueue("session", "question", "latest");
    expect(send).not.toHaveBeenCalled();
    saver.dispose();
    await saver.flush();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ value: "latest" }), true);
  });
  it("uses deletion values for empty text and deselected optional choices", () => {
    expect(normalizeAnswer("  ")).toBeNull();
    expect(normalizeAnswer([])).toBeNull();
    expect(normalizeAnswer(0)).toBe(0);
    expect(normalizeAnswer("hello")).toBe("hello");
  });
  it("restores a failed edit in a new instance and removes its backup only after acknowledgement", async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const first = new AnswerAutosave({ send: async () => ({ ok: false }), storage: () => storage });
    first.enqueue("session", "q", "pending");
    expect(await first.flush()).toBe(false);
    const send = vi.fn(async () => ({ ok: true }));
    const next = new AnswerAutosave({ send, storage: () => storage });
    expect(next.restore("session", ["q"])).toEqual({ q: "pending" });
    expect(await next.flush()).toBe(true);
    expect(storage.data.size).toBe(0);
    first.forget("session"); first.dispose(); next.dispose();
  });
  it("serializes edits while an older request is still in flight", async () => {
    vi.useFakeTimers();
    let release!: (result: { ok: boolean }) => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue({ ok: true });
    const storage = memoryStorage();
    const saver = new AnswerAutosave({ send, storage: () => storage });
    saver.enqueue("s", "q", "old");
    const flush = saver.flush();
    saver.enqueue("s", "q", "new");
    expect(send).toHaveBeenCalledTimes(1);
    release({ ok: true });
    expect(await flush).toBe(true);
    expect(send.mock.calls.map(call => call[0].value)).toEqual(["old", "new"]);
    expect(storage.data.size).toBe(0);
    saver.dispose();
  });
  it("retries transient errors without losing the pending revision", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValueOnce({ ok: false, retryable: true }).mockResolvedValue({ ok: true });
    const saver = new AnswerAutosave({ send });
    saver.enqueue("s", "q", "retry");
    expect(await saver.flush()).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await saver.flush()).toBe(true);
    saver.dispose();
  });
  it("never replays answers into another session or unknown question", () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const first = new AnswerAutosave({ send: async () => ({ ok: false }), storage: () => storage });
    first.enqueue("owner-session", "q", "private answer");
    const second = new AnswerAutosave({ send: async () => ({ ok: true }), storage: () => storage });
    expect(second.restore("another-session", ["q"])).toEqual({});
    expect(second.restore("owner-session", ["different-q"])).toEqual({});
    first.forget("owner-session"); first.dispose(); second.dispose();
  });
  it("continues saving when sessionStorage is unavailable", async () => {
    vi.useFakeTimers();
    const saver = new AnswerAutosave({ send: async () => ({ ok: true }), storage: () => { throw new Error("blocked"); } });
    saver.enqueue("s", "q", "still saved");
    expect(await saver.flush()).toBe(true);
    saver.dispose();
  });
});

describe("pending answers follow live instrument changes",()=>{
  it("rebinds edits rejected by the closed old session and archives incompatible values",async()=>{
    vi.useFakeTimers();
    const storage=memoryStorage();
    const send=vi.fn(async(answer:{sessionId:string})=>({ok:answer.sessionId==="new"}));
    const saver=new AnswerAutosave({send,storage:()=>storage});
    saver.enqueue("old","text","unsaved text");saver.enqueue("old","choice",4);
    expect(await saver.flush("old")).toBe(false);
    expect(await saver.rebindSession("old","new",id=>id==="text"?"new-text":undefined)).toEqual({"new-text":"unsaved text"});
    expect(saver.historyAnswers("old")).toEqual({choice:4});
    expect(await saver.flush("new")).toBe(true);
    expect(new AnswerAutosave({send,storage:()=>storage}).historyAnswers("old")).toEqual({choice:4});
    saver.dispose();
  });
  it("keeps newer pending values when recovering an older form after reload",async()=>{
    vi.useFakeTimers();
    const storage=memoryStorage();
    const saver=new AnswerAutosave({send:async()=>({ok:false}),storage:()=>storage});
    saver.enqueue("old","q","old edit");saver.enqueue("new","new-q","newer edit");
    expect(await saver.rebindSession("old","new",()=>"new-q")).toEqual({"new-q":"newer edit"});
    expect(saver.restore("new",["new-q"])).toEqual({"new-q":"newer edit"});saver.dispose();
  });
  it("waits for an old in-flight save, then transfers the latest failed local revision",async()=>{
    vi.useFakeTimers();let release!:(value:{ok:boolean})=>void;
    const send=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue({ok:false});
    const saver=new AnswerAutosave({send});saver.enqueue("old","q","earlier");const flight=saver.flush("old");saver.enqueue("old","q","latest");
    const rebind=saver.rebindSession("old","new",()=>"new-q");release({ok:false});await flight;
    expect(await rebind).toEqual({"new-q":"latest"});saver.dispose();
  });
});
