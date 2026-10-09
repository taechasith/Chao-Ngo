"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseAdditionalAiLinks, type AiPreparation } from "../ai-preparation";

type Draft = { aiCompanionUsed: boolean; linksText: string };
const empty: Draft = { aiCompanionUsed: false, linksText: "" };
const storageKey = (id: string) => `chao-ngo:ai-preparation:${id}`;
export function useAiPreparation(id: string | undefined, initial: AiPreparation | undefined, editable: boolean) {
  const [draft, setDraft] = useState<Draft>(empty);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const current = useRef({ id: "", draft: empty });
  const saved = useRef("");
  const flight = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    if (!id || current.current.id === id) return;
    const server = { aiCompanionUsed: Boolean(initial?.aiCompanionUsed), linksText: (initial?.additionalAiLinks ?? []).join("\n") };
    let restored = server;
    if (editable) try {
      const raw = JSON.parse(localStorage.getItem(storageKey(id)) ?? "null") as Draft | null;
      if (raw && typeof raw.aiCompanionUsed === "boolean" && typeof raw.linksText === "string" && raw.linksText.length <= 10_100) restored = raw;
    } catch { /* Browser storage is optional. */ }
    current.current = { id, draft: restored };
    saved.current = JSON.stringify(server);
    setDraft(restored); setStatus(restored === server ? "" : "มีข้อมูลค้างบันทึก กำลังลองบันทึกใหม่");
  }, [id, initial, editable]);

  const change = useCallback((patch: Partial<Draft>) => {
    const value = { ...current.current.draft, ...patch };
    current.current = { ...current.current, draft: value };
    setDraft(value); setStatus("มีข้อมูลค้างบันทึก");
    try { localStorage.setItem(storageKey(current.current.id), JSON.stringify(value)); } catch { /* Keep the in-memory draft. */ }
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (flight.current) { if (!(await flight.current)) return false; }
    const snapshot = current.current;
    if (!snapshot.id || !editable) return true;
    const raw = JSON.stringify(snapshot.draft);
    if (raw === saved.current) return true;
    const links = parseAdditionalAiLinks(snapshot.draft.linksText.split(/\r?\n/).map(value => value.trim()).filter(Boolean));
    if (!links) { setStatus("ใส่ลิงก์ HTTPS ที่ถูกต้อง ไม่เกิน 5 ลิงก์ โดยแยกบรรทัดละลิงก์"); return false; }
    setPending(true); setStatus("กำลังบันทึกข้อมูล AI…");
    const work = (async () => {
      try {
        const response = await fetch(`/api/submissions/${encodeURIComponent(snapshot.id)}/preparation`, {
          method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiCompanionUsed: snapshot.draft.aiCompanionUsed, additionalAiLinks: links }),
        });
        if (!response.ok) throw new Error(response.status === 401 ? "กรุณาเข้าสู่ระบบอีกครั้ง ข้อมูล AI ที่กรอกไว้ยังอยู่" : "ยังบันทึกข้อมูล AI ไม่ได้ ลองอีกครั้งเมื่อเครือข่ายพร้อม");
        if (current.current.id === snapshot.id) {
          saved.current = raw;
          if (JSON.stringify(current.current.draft) === raw) {
            setStatus("บันทึกข้อมูล AI แล้ว");
            try { localStorage.removeItem(storageKey(snapshot.id)); } catch { /* Optional storage. */ }
          }
        }
        return true;
      } catch (error) {
        if (current.current.id === snapshot.id) setStatus(error instanceof Error ? error.message : "บันทึกข้อมูล AI ไม่สำเร็จ");
        return false;
      } finally { setPending(false); }
    })();
    flight.current = work;
    const ok = await work;
    if (flight.current === work) flight.current = null;
    if (ok && JSON.stringify(current.current.draft) !== saved.current) return flush();
    return ok;
  }, [editable]);

  useEffect(() => {
    if (!id || !editable || JSON.stringify(draft) === saved.current) return;
    const timer = window.setTimeout(() => void flush(), 1200);
    return () => window.clearTimeout(timer);
  }, [draft, id, editable, flush]);
  useEffect(() => {
    const retry = () => void flush();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [flush]);
  return { ...draft, change, flush, status, pending };
}
