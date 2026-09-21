"use client";

import { useEffect, useState } from "react";

import { AppShell } from "../../components/player/app-shell";
import { Panel, StatusBadge } from "../../components/player/panel";

type MotionSetting = "system" | "reduce" | "full";

export default function SettingsPage() {
  const [motion, setMotion] = useState<MotionSetting>("system");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("jao-ngoh-motion");
      if (stored === "system" || stored === "reduce" || stored === "full") setMotion(stored);
    } catch { /* Settings can still be changed for this visit. */ }
  }, []);

  function changeMotion(value: MotionSetting) {
    setMotion(value);
    document.documentElement.dataset.motion = value;
    try { window.localStorage.setItem("jao-ngoh-motion", value); } catch { /* Storage may be disabled. */ }
  }

  return (
    <AppShell pageTitle="ตั้งค่า">
      <div className="player-content">
        <header className="player-page-heading" data-player-reveal="heading">
          <StatusBadge>PLAYER SETTINGS / EXPERIENCE</StatusBadge>
          <h1>ตั้งค่าพื้นที่คิดของคุณ</h1>
          <p>การตั้งค่านี้บันทึกไว้ในอุปกรณ์ที่คุณกำลังใช้</p>
        </header>
        <div className="player-settings-layout" data-player-reveal="primary">
        <Panel>
          <fieldset>
            <legend className="font-display text-2xl text-white">การเคลื่อนไหว</legend>
            <p className="mt-3 max-w-prose text-sm leading-7 text-white/60">เลือกให้ภาพเคลื่อนไหวทำงานตามอุปกรณ์ ลดลง หรือเปิดทั้งหมด</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {([
                ["system", "ตามอุปกรณ์"],
                ["reduce", "ลดการเคลื่อนไหว"],
                ["full", "เปิดการเคลื่อนไหว"],
              ] as const).map(([value, label]) => (
                <label className="player-setting-option" key={value}>
                  <input checked={motion === value} name="motion" onChange={() => changeMotion(value)} type="radio" value={value} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Panel>
        <aside className="player-panel player-panel--quiet">
          <span className="player-eyebrow">ACCESSIBILITY</span>
          <h2 className="mt-3 font-display text-2xl text-white">ให้ความคิดเดินในจังหวะของคุณ</h2>
          <p className="mt-3 text-sm leading-7 text-white/60">การลดการเคลื่อนไหวจะปิดการเปลี่ยนผ่านที่ไม่จำเป็น โดยยังคงการทำงานของทุกหน้าจอไว้เหมือนเดิม</p>
        </aside>
        </div>
      </div>
    </AppShell>
  );
}
