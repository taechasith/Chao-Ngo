"use client";

import { useEffect, useState } from "react";

export function CaseProgress({ subgameId }: { subgameId: string }) {
  const [status, setStatus] = useState("กำลังดูสถานะความคืบหน้า…");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const notice = await fetch("/api/research-consent/notice", { signal: controller.signal }).then((response) => response.ok ? response.json() as Promise<{ collectionEnabled: boolean }> : null);
      if (!notice) { setStatus("ยังดูความคืบหน้าที่บันทึกไว้ไม่ได้"); return; }
      if (!notice.collectionEnabled) { setStatus("เปิดสำรวจได้ ขณะนี้ระบบยังไม่เปิดบันทึกความคืบหน้างานวิจัย"); return; }
      const response = await fetch("/api/player-progress", { credentials: "same-origin", signal: controller.signal });
      if (!response.ok) { setStatus("เข้าสู่ระบบและให้ความยินยอมเพื่อดูความคืบหน้าที่บันทึกไว้"); return; }
      const result = await response.json() as { progress: Array<{ subgame_id: string; status: string }> };
      const progress = result.progress.find((item) => item.subgame_id === subgameId);
      setStatus(progress?.status === "completed" ? "คดีนี้เสร็จแล้ว กลับมาทบทวนหลักฐานได้เสมอ" : progress?.status === "in_progress" ? "กำลังสืบสวน กลับมาต่อจากหลักฐานที่คุณสนใจได้เลย" : "ยังไม่มีความคืบหน้าที่บันทึกไว้สำหรับคดีนี้");
    })().catch(() => { if (!controller.signal.aborted) setStatus("ยังดูความคืบหน้าที่บันทึกไว้ไม่ได้"); });
    return () => controller.abort();
  }, [subgameId]);

  return <p role="status">{status}</p>;
}
