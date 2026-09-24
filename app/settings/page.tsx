"use client";

import { useEffect, useState } from "react";

import { AppShell } from "../../components/player/app-shell";
import { HelpButton } from "../../components/player/help-button";
import { StatusBadge } from "../../components/player/panel";

type MotionSetting = "system" | "reduce" | "off";
type PlayerSettings = { music: { enabled: boolean; url: string | null }; soundEffects: boolean };

function readBoolean(key: string, fallback: boolean) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch { return fallback; }
}

function writePreference(key: string, value: string | boolean | number) {
  try { window.localStorage.setItem(key, String(value)); } catch { /* Preferences remain active for this visit. */ }
}

export default function SettingsPage() {
  const [autoGuide, setAutoGuide] = useState(true);
  const [showSaveStatus, setShowSaveStatus] = useState(true);
  const [motion, setMotion] = useState<MotionSetting>("system");
  const [soundEffects, setSoundEffects] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(0.55);
  const [textSize, setTextSize] = useState<"normal" | "large">("normal");
  const [playerSettings, setPlayerSettings] = useState<PlayerSettings | null>(null);
  const [resetMessage, setResetMessage] = useState("");

  useEffect(() => {
    try {
      const storedMotion = window.localStorage.getItem("jao-ngoh-motion");
      if (storedMotion === "system" || storedMotion === "reduce" || storedMotion === "off") setMotion(storedMotion);
      const storedTextSize = window.localStorage.getItem("jao-ngoh-text-size");
      if (storedTextSize === "normal" || storedTextSize === "large") setTextSize(storedTextSize);
    } catch { /* Defaults remain available when storage is unavailable. */ }
    setAutoGuide(readBoolean("jao-ngoh-auto-guide", true));
    setShowSaveStatus(readBoolean("jao-ngoh-show-save-status", true));
    setSoundEffects(readBoolean("jao-ngoh-sound-effects", false));
    setMusicEnabled(readBoolean("jao-ngoh-music-enabled", true));
    try {
      const storedVolume = Number(window.localStorage.getItem("jao-ngoh-music-volume"));
      if (Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1) setMusicVolume(storedVolume);
    } catch { /* Defaults remain available when storage is unavailable. */ }
    void fetch("/api/player-settings", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<PlayerSettings> : null)
      .then((settings) => {
        setPlayerSettings(settings);
        try {
          if (settings && window.localStorage.getItem("jao-ngoh-sound-effects") === null) setSoundEffects(settings.soundEffects);
        } catch { /* The local opt-in default remains when storage is unavailable. */ }
      })
      .catch(() => setPlayerSettings({ music: { enabled: false, url: null }, soundEffects: false }));
  }, []);

  function changeMotion(value: MotionSetting) {
    setMotion(value);
    if (value === "system") document.documentElement.removeAttribute("data-motion");
    else document.documentElement.dataset.motion = value;
    writePreference("jao-ngoh-motion", value);
  }

  function changeTextSize(value: "normal" | "large") {
    setTextSize(value);
    document.documentElement.dataset.textSize = value;
    writePreference("jao-ngoh-text-size", value);
  }

  function resetGuides() {
    try {
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (key?.startsWith("jao-ngoh-guide-seen:")) window.sessionStorage.removeItem(key);
      }
      setResetMessage("รีเซ็ตคำแนะนำแล้ว เปิดแฟ้มครั้งถัดไปเพื่อเริ่มใหม่");
    } catch { setResetMessage("รีเซ็ตคำแนะนำสำหรับการเยี่ยมชมนี้ไม่ได้"); }
  }

  return (
    <AppShell pageTitle="ตั้งค่า">
      <div className="player-content player-settings-page">
        <header className="player-page-heading motion-rise">
          <StatusBadge>SYSTEM CONTROL / SETTINGS</StatusBadge>
          <h1>ตั้งค่าประสบการณ์ของคุณ</h1>
          <p>ปรับวิธีที่เจ้าเงาะแสดงผล เคลื่อนไหว และช่วยแนะนำระหว่างการสืบ</p>
        </header>
        <div className="player-settings-layout motion-panel">
          <div className="player-settings-column">
            <section className="player-settings-section" aria-labelledby="guidance-title">
              <header><span className="player-eyebrow">GUIDANCE / เจ้าเงาะ</span><h2 id="guidance-title">คำแนะนำ</h2></header>
              <div className="player-settings-row" data-guide="settings-auto-guide"><div><strong>คำแนะนำอัตโนมัติ</strong><p>แสดงคำแนะนำเมื่อคุณพบระบบใหม่ครั้งแรก</p></div><label className="player-toggle"><input checked={autoGuide} onChange={(event) => { setAutoGuide(event.target.checked); writePreference("jao-ngoh-auto-guide", event.target.checked); }} type="checkbox" /><span aria-hidden="true" /></label></div>
              <div className="player-settings-actions"><HelpButton guideKey="settings" pageTitle="ตั้งค่า" /><button className="player-text-action" data-guide="settings-reset-guides" onClick={resetGuides} type="button">รีเซ็ตคำแนะนำทั้งหมด</button></div>
              {resetMessage ? <p className="player-settings-note" role="status">{resetMessage}</p> : null}
              <label className="player-settings-subrow"><input checked={showSaveStatus} onChange={(event) => { setShowSaveStatus(event.target.checked); writePreference("jao-ngoh-show-save-status", event.target.checked); }} type="checkbox" /> แสดงสถานะการบันทึก</label>
            </section>
            <section className="player-settings-section" data-guide="settings-motion" aria-labelledby="motion-title"><header><span className="player-eyebrow">MOTION</span><h2 id="motion-title">การเคลื่อนไหว</h2></header><div className="player-segmented-control">{([ ["system", "ตามอุปกรณ์"], ["reduce", "ลดการเคลื่อนไหว"], ["off", "ปิดการเคลื่อนไหว"] ] as const).map(([value, label]) => <label key={value}><input checked={motion === value} name="motion" onChange={() => changeMotion(value)} type="radio" value={value} /><span>{label}</span></label>)}</div></section>
          </div>
          <div className="player-settings-column player-settings-column--secondary">
            <section className="player-settings-section" data-guide="settings-sound" aria-labelledby="audio-title"><header><span className="player-eyebrow">AUDIO</span><h2 id="audio-title">เสียง</h2></header><div className="player-settings-row"><div><strong>เสียงตอบสนองของปุ่ม</strong><p>เปิดหรือปิดเสียง UI ได้จากตรงนี้</p></div><label className="player-toggle"><input checked={soundEffects} onChange={(event) => { setSoundEffects(event.target.checked); writePreference("jao-ngoh-sound-effects", event.target.checked); }} type="checkbox" /><span aria-hidden="true" /></label></div>{playerSettings?.music.enabled && playerSettings.music.url ? <div className="player-settings-music"><label className="player-settings-subrow"><input checked={musicEnabled} onChange={(event) => { setMusicEnabled(event.target.checked); writePreference("jao-ngoh-music-enabled", event.target.checked); }} type="checkbox" /> เพลงประกอบ</label><audio controls loop muted={!musicEnabled} preload="none" src={playerSettings.music.url} /><input aria-label="ระดับเสียง" max="1" min="0" onChange={(event) => { setMusicVolume(Number(event.target.value)); writePreference("jao-ngoh-music-volume", Number(event.target.value)); }} step="0.05" type="range" value={musicVolume} /></div> : <p className="player-settings-note">เพลงประกอบจะปรากฏเมื่อผู้ดูแลระบบตั้งค่าไฟล์เพลง</p>}</section>
            <section className="player-settings-section" data-guide="settings-text-size" aria-labelledby="reading-title"><header><span className="player-eyebrow">READING</span><h2 id="reading-title">ขนาดตัวอักษร</h2></header><div className="player-segmented-control player-segmented-control--two">{([ ["normal", "ปกติ"], ["large", "ใหญ่"] ] as const).map(([value, label]) => <label key={value}><input checked={textSize === value} name="text-size" onChange={() => changeTextSize(value)} type="radio" value={value} /><span>{label}</span></label>)}</div><p className={`player-reading-preview player-reading-preview--${textSize}`}>ตัวอย่างข้อความสำหรับอ่าน</p></section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
