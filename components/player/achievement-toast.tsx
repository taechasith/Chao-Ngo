"use client";

import { useEffect, useState } from "react";
import { Award, X } from "lucide-react";

type Notification = { body_th: string; created_at: string; kind: string };

export function AchievementToast() {
  const [notification, setNotification] = useState<Notification | null>(null);

  useEffect(() => {
    void fetch("/api/player-notifications", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ notifications?: Notification[] }> : null)
      .then((payload) => {
        const latest = payload?.notifications?.[0];
        if (!latest) return;
        const storageKey = `jao-ngoh-achievement:${latest.kind}:${latest.created_at}`;
        try {
          if (localStorage.getItem(storageKey)) return;
          localStorage.setItem(storageKey, "1");
        } catch { /* The toast can still appear for this visit. */ }
        setNotification(latest);
      })
      .catch(() => undefined);
  }, []);

  if (!notification) return null;

  return (
    <aside aria-live="polite" className="player-achievement-toast" role="status">
      <Award aria-hidden="true" size={20} />
      <div>
        <span className="player-eyebrow">ACHIEVEMENT / บันทึกแล้ว</span>
        <p>{notification.body_th}</p>
      </div>
      <button aria-label="ปิดการแจ้งเตือน" className="player-close-button" onClick={() => setNotification(null)} type="button">
        <X aria-hidden="true" size={16} />
      </button>
    </aside>
  );
}
