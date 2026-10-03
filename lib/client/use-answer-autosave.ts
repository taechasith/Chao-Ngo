"use client";

import { useEffect, useState } from "react";
import { AnswerAutosave, type AnswerSaveState } from "./answer-autosave";

let browserSaver: AnswerAutosave | undefined;

export function useAnswerAutosave(onError: (message: string) => void) {
  const [status, setStatus] = useState<AnswerSaveState>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [saver] = useState(() => {
    if (typeof window !== "undefined" && browserSaver) return browserSaver;
    const created = new AnswerAutosave({
    storage: () => typeof window === "undefined" ? undefined : window.sessionStorage,
    send: async (answer, keepalive) => {
      const response = await fetch(`/api/questionnaire-sessions/${answer.sessionId}/responses`, {
        body: JSON.stringify({ questionId: answer.questionId, value: answer.value }),
        credentials: "same-origin", headers: { "Content-Type": "application/json" }, method: "PUT", keepalive,
      });
      if (response.ok) return { ok: true };
      return {
        ok: false, retryable: response.status >= 500 || response.status === 429,
        message: response.status === 401
          ? "กรุณาเข้าสู่ระบบอีกครั้ง คำตอบยังค้างบันทึกในแท็บนี้"
          : response.status === 400 ? "ยังบันทึกคำตอบไม่ได้ กรุณาตรวจรูปแบบคำตอบแล้วลองอีกครั้ง"
          : "ยังบันทึกคำตอบไม่ได้ คำตอบยังค้างอยู่ในแท็บนี้ กรุณาลองอีกครั้ง",
      };
    },
    });
    if (typeof window !== "undefined") browserSaver = created;
    return created;
  });
  useEffect(() => { saver.setErrorHandler(onError); return () => saver.setErrorHandler(); }, [saver, onError]);
  useEffect(() => {
    saver.resume();
    const unsubscribe = saver.subscribe((state, count) => { setStatus(state); setPendingCount(count); });
    const flush = () => { void saver.flush(); };
    const hide = () => { if (document.visibilityState === "hidden") void saver.flush(undefined, true); };
    const leave = () => { void saver.flush(undefined, true); };
    window.addEventListener("online", flush);
    window.addEventListener("focus", flush);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hide);
    return () => {
      unsubscribe();
      window.removeEventListener("online", flush); window.removeEventListener("focus", flush);
      window.removeEventListener("pagehide", leave); document.removeEventListener("visibilitychange", hide);
      saver.dispose();
    };
  }, [saver]);
  return { saver, status, pendingCount };
}
