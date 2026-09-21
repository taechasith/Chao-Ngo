"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppShell } from "../../components/player/app-shell";
import { Panel, StatusBadge } from "../../components/player/panel";

type ProgressResponse = {
  achievements: Array<{ achievement_key: string; earned_at: string; subgame_id?: string }>;
  letter: { eligible_at: string | null; letter_emailed_at: string | null; status: "pending" | "eligible" | "emailed" } | null;
  notifications: Array<{ body_th: string; created_at: string; kind: string; read_at: string | null }>;
  progress: Array<{ completed_at: string | null; last_activity_at?: string; status: string; subgame_title: string; subgame_slug?: string }>;
  userName: string | null;
};

const achievementNames: Record<string, string> = {
  investigation_begun: "เปิดการสืบสวนครั้งแรก",
  subgame_completed: "สืบคดีสำเร็จ",
  all_required_subgames_completed: "สืบครบทุกคดีที่กำหนด",
  thank_you_letter_eligible: "พร้อมรับจดหมายขอบคุณ",
};

function formatDate(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(date);
}

export default function ProfilePage() {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [message, setMessage] = useState("กำลังโหลดความคืบหน้า");

  useEffect(() => {
    void fetch("/api/research-consent/notice", { credentials: "same-origin" })
      .then(async (response) => response.ok ? response.json() as Promise<{ collectionEnabled: boolean }> : null)
      .then(async (notice) => {
        if (!notice?.collectionEnabled) {
          setMessage("ความคืบหน้าจะปรากฏเมื่อระบบวิจัยเปิดใช้งาน");
          return;
        }
        const [progressResponse, notificationsResponse, sessionResponse] = await Promise.all([
          fetch("/api/player-progress", { credentials: "same-origin" }),
          fetch("/api/player-notifications", { credentials: "same-origin" }),
          fetch("/api/auth/get-session", { credentials: "same-origin" }),
        ]);
        const body = await progressResponse.json() as Omit<ProgressResponse, "notifications" | "userName"> & { code?: string };
        if (!progressResponse.ok) throw new Error(body.code ?? "PROFILE_UNAVAILABLE");
        const notificationBody = notificationsResponse.ok
          ? await notificationsResponse.json() as { notifications?: ProgressResponse["notifications"] }
          : null;
        const sessionBody = sessionResponse.ok
          ? await sessionResponse.json() as { user?: { name?: unknown } }
          : null;
        setData({
          ...body,
          notifications: notificationBody?.notifications ?? [],
          userName: typeof sessionBody?.user?.name === "string" && sessionBody.user.name.trim()
            ? sessionBody.user.name.trim()
            : null,
        });
        setMessage("");
      })
      .catch(() => setMessage("เข้าสู่ระบบและยินยอมเข้าร่วมการวิจัยเพื่อดูความคืบหน้าของคุณ"));
  }, []);

  return (
    <AppShell pageTitle="โปรไฟล์และความคืบหน้า">
      <div className="player-content">
        <header className="player-page-heading" data-player-reveal="heading">
          <StatusBadge>YOUR CASE HISTORY</StatusBadge>
          <h1>สิ่งที่คุณเคยสืบไว้</h1>
          <p>กลับมาทำคดีที่เริ่มไว้ และทบทวนสิ่งที่คุณเคยตัดสินใจ</p>
          {data?.userName ? <p className="mt-3 text-sm text-white/50">ผู้เล่น: {data.userName}</p> : null}
        </header>
        {!data ? (
          <section className="player-progress-grid player-progress-empty" data-player-reveal="primary">
            <Panel>
              <span className="player-eyebrow">MEMORY / CURRENT STATE</span>
              <h2 className="mt-3 font-display text-3xl text-white">สิ่งที่คุณเคยสืบจะอยู่ที่นี่</h2>
              <p role="status" className="player-empty-memory mt-5">{message}</p>
              <Link className="player-button player-button--primary mt-6" href={message.includes("เข้าสู่ระบบ") ? "/login" : "/play"}>{message.includes("เข้าสู่ระบบ") ? "เข้าสู่ระบบ" : "ไปที่แฟ้มคดี"}</Link>
            </Panel>
            <aside className="player-locked-rail" aria-label="ลำดับความทรงจำของคดี">
              <span><b>01</b>เปิดแฟ้มที่คุณสงสัย</span>
              <span><b>02</b>กลับมาดูหลักฐานได้เสมอ</span>
              <span><b>03</b>ดูความคืบหน้าได้เมื่อระบบวิจัยเปิดใช้งาน</span>
            </aside>
          </section>
        ) : (
          <div className="player-progress-grid" data-player-reveal="primary">
            <Panel>
              <span className="player-eyebrow">CASE PROGRESS</span>
              <h2 className="mt-2 font-display text-2xl text-white">แฟ้มที่คุณเปิดแล้ว</h2>
              {data.progress.length ? <div className="mt-5 grid gap-3">{data.progress.map((item) => <article className="player-archive-record" key={item.subgame_title}>
                <strong>{item.subgame_title}</strong>
                <span>{item.status === "completed" ? "บันทึกว่าเสร็จแล้ว" : item.status === "in_progress" ? "ยังกลับมาสืบต่อได้" : "ยังไม่เริ่ม"}</span>
                {item.last_activity_at ? <span>กลับมาล่าสุด {formatDate(item.last_activity_at)}</span> : null}
                {item.subgame_slug === "quantum" || item.subgame_slug === "space" ? <Link className="player-text-action" href={`/play/node-zone/${item.subgame_slug}`}>{item.status === "completed" ? "ทบทวนหลักฐาน" : "กลับไปที่คดี"}</Link> : null}
              </article>)}</div> : <div className="mt-5"><p className="player-empty-memory">ยังไม่มีคดีที่บันทึกไว้</p><Link className="player-button mt-4" href="/play">เลือกแฟ้มคดี</Link></div>}
            </Panel>
            <Panel>
              <span className="player-eyebrow">ACHIEVEMENTS</span>
              <h2 className="mt-2 font-display text-2xl text-white">สิ่งที่ระบบจดจำไว้</h2>
              {data.letter?.status === "eligible" ? <p className="player-empty-memory mt-5" role="status">คุณมีคุณสมบัติตามเกณฑ์รับจดหมายขอบคุณแล้ว ทีมโครงการจะดำเนินการต่อเมื่อพร้อม</p> : null}
              {data.letter?.status === "emailed" ? <p className="player-empty-memory mt-5" role="status">ทีมโครงการบันทึกว่าส่งจดหมายขอบคุณให้คุณแล้ว</p> : null}
              {data.achievements.length ? <div className="mt-5 grid gap-3">{data.achievements.map((item) => <article className="player-archive-record" key={`${item.achievement_key}:${item.subgame_id}:${item.earned_at}`}><strong>{achievementNames[item.achievement_key] ?? "กิจกรรมสำคัญในคดี"}</strong><span>{formatDate(item.earned_at)}</span></article>)}</div> : <p className="player-empty-memory mt-5">เมื่อคุณทำกิจกรรมสำคัญในคดี ระบบจะบันทึกไว้ที่นี่</p>}
              {data.notifications.length ? <section className="player-notice-section mt-6" aria-label="บันทึกล่าสุดจากแฟ้มคดี"><span aria-hidden="true">//</span><div><h3>บันทึกล่าสุด</h3><div className="grid gap-3">{data.notifications.slice(0, 3).map((item) => <article className="player-archive-record" key={`${item.kind}:${item.created_at}`}><strong>{item.body_th}</strong><span>{formatDate(item.created_at)}</span></article>)}</div></div></section> : null}
            </Panel>
          </div>
        )}
      </div>
    </AppShell>
  );
}
