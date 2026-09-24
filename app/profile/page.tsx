"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { kaRouteForSubgameId } from "../../lib/ka-casefiles";
import { AppShell } from "../../components/player/app-shell";
import { Panel, StatusBadge } from "../../components/player/panel";
import { InvestigativeAction } from "../../components/player/investigative-action";

type ProgressItem = { completed_at: string | null; game_slug: string; last_activity_at?: string | null; status: string; subgame_id: string; subgame_slug?: string; subgame_title: string };
type EvidenceItem = { evidence_total: number; evidence_viewed: number; last_evidence_at: string | null; subgame_id: string };
type SubmissionItem = { ai_pdf_uploaded: number; status: string; subgame_id: string; updated_at: string };
type ProfileData = {
  achievements: Array<{ achievement_key: string; earned_at: string; subgame_id?: string }>;
  consent: { ai_chat_upload_consent: number; consent_version: string; consented_at: string } | null;
  evidence: EvidenceItem[];
  letter: { eligible_at: string | null; letter_emailed_at: string | null; status: "pending" | "eligible" | "emailed" } | null;
  notifications: Array<{ body_th: string; created_at: string; kind: string }>;
  progress: ProgressItem[];
  submissions: SubmissionItem[];
  user: { createdAt?: string; email: string; name: string };
};

const caseImages: Record<string, string> = {
  fintech: "/ka-casefiles/maimee/scene-01.png",
  maimee: "/ka-casefiles/maimee/scene-01.png",
  quantum: "/node-zone-hero/quantum/AIenhance_CCTV.png",
  space: "/node-zone-hero/space/AIenhance_CCTV.png",
  "wa-ve": "/ka-casefiles/personnel/tete-techametakun.png",
};

const legacyKaSubgameIds = new Set(["subgame-ka-psychology", "subgame-ka-biotech"]);

const achievementNames: Record<string, string> = {
  investigation_begun: "เปิดแฟ้มคดีครั้งแรก",
  subgame_completed: "สืบคดีสำเร็จ",
  all_required_subgames_completed: "สืบครบทุกคดีที่กำหนด",
  thank_you_letter_eligible: "พร้อมรับหนังสือขอบคุณ",
};

function formatDate(value?: string | null) {
  if (!value) return "ยังไม่มีข้อมูล";
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? "ยังไม่มีข้อมูล" : new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(date);
}

function caseLabel(item: ProgressItem) {
  if (item.subgame_id === "subgame-ka-fintech" || item.subgame_slug === "maimee" || item.subgame_slug === "fintech") return "คดี MAIMEE · FinTech";
  if (item.subgame_id === "subgame-ka-wa-ve" || item.subgame_slug === "wa-ve") return "คดี WA VE · Bio";
  return item.subgame_slug === "quantum" ? "คดีควอนตัม" : item.subgame_slug === "space" ? "คดีอวกาศ" : item.subgame_title;
}

function isLegacyKaProgress(item: ProgressItem): boolean {
  return legacyKaSubgameIds.has(item.subgame_id);
}

function statusLabel(status: string) {
  if (status === "completed" || status === "accepted") return "เสร็จแล้ว";
  if (status === "submitted") return "ส่งแล้ว รอตรวจ";
  if (status === "in_progress") return "กำลังสืบ";
  if (status === "needs_revision") return "รอแก้ไข";
  return "ยังไม่เริ่ม";
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "JG";
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("กำลังเปิดแฟ้มประวัติของคุณ");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/player-progress", { credentials: "same-origin", signal: controller.signal }),
      fetch("/api/player-notifications", { credentials: "same-origin", signal: controller.signal }),
      fetch("/api/auth/get-session", { credentials: "same-origin", signal: controller.signal }),
    ]).then(async ([progressResponse, notificationsResponse, sessionResponse]) => {
      const progressBody = await progressResponse.json() as Omit<ProfileData, "notifications" | "user"> & { code?: string };
      if (!progressResponse.ok) throw new Error(progressBody.code ?? "PROFILE_UNAVAILABLE");
      const notificationsBody = notificationsResponse.ok ? await notificationsResponse.json() as { notifications?: ProfileData["notifications"] } : {};
      const sessionBody = sessionResponse.ok ? await sessionResponse.json() as { user?: ProfileData["user"] } : {};
      if (!sessionBody.user?.email) throw new Error("PROFILE_SESSION_UNAVAILABLE");
      const nextData = { ...progressBody, notifications: notificationsBody.notifications ?? [], user: sessionBody.user } as ProfileData;
      setData(nextData);
      setName(nextData.user.name);
      setLoadingMessage("");
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadingMessage(error instanceof Error && error.message === "RESEARCH_CONSENT_REQUIRED" ? "ยืนยัน Consent ก่อนจึงจะดูสถานะการวิจัยได้" : "ยังเปิดข้อมูลโปรไฟล์ไม่ได้ ลองใหม่อีกครั้ง");
    });
    return () => controller.abort();
  }, []);

  const visibleProgress = useMemo(() => (data?.progress ?? []).filter((item) => !isLegacyKaProgress(item)), [data]);
  const legacyKaHistory = useMemo(() => (data?.progress ?? []).filter(isLegacyKaProgress), [data]);
  const activeCase = useMemo(() => visibleProgress.find((item) => item.status === "in_progress") ?? null, [visibleProgress]);
  const evidenceBySubgame = useMemo(() => new Map((data?.evidence ?? []).map((item) => [item.subgame_id, item])), [data]);
  const submissionBySubgame = useMemo(() => {
    const map = new Map<string, SubmissionItem>();
    for (const item of data?.submissions ?? []) if (!map.has(item.subgame_id)) map.set(item.subgame_id, item);
    return map;
  }, [data]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || savingName) return;
    setSavingName(true); setProfileMessage("");
    try {
      const response = await fetch("/api/auth/update-user", { body: JSON.stringify({ name: nextName }), credentials: "same-origin", headers: { "Content-Type": "application/json" }, method: "POST" });
      if (!response.ok) throw new Error("PROFILE_UPDATE_FAILED");
      setData((current) => current ? { ...current, user: { ...current.user, name: nextName } } : current);
      setEditing(false); setProfileMessage("บันทึกชื่อแล้ว");
    } catch { setProfileMessage("บันทึกชื่อไม่ได้ในขณะนี้"); }
    finally { setSavingName(false); }
  }

  return (
    <AppShell pageTitle="โปรไฟล์และความคืบหน้า">
      <div className="player-content">
        <header className="player-page-heading" data-player-reveal="heading"><StatusBadge>PLAYER PROFILE / CASE ARCHIVE</StatusBadge><h1>แฟ้มที่คุณเคยเปิด</h1><p>กลับมาดูว่าคุณกำลังสืบอะไร เปิดหลักฐานไว้แค่ไหน และสถานะงานวิจัยของคุณอยู่ตรงไหน</p></header>
        {!data ? <section className="player-profile-layout" data-player-reveal="primary"><Panel><p className="player-empty-memory" role="status">{loadingMessage}</p></Panel></section> : <>
          <section className="player-profile-identity" data-player-reveal="primary">
            <div className="player-profile-avatar" aria-label={`อวตารของ ${data.user.name}`}>{initials(data.user.name)}</div>
            <div className="player-profile-identity-copy"><span className="player-eyebrow">IDENTITY / PLAYER</span><h2>{data.user.name}</h2><p>{data.user.email}</p><span>สมาชิกเจ้าเงาะ · เข้าร่วมเมื่อ {formatDate(data.user.createdAt)}</span></div>
            {!editing ? <button className="player-button" onClick={() => setEditing(true)} type="button">แก้ไขโปรไฟล์</button> : <form className="player-profile-edit" onSubmit={saveProfile}><label className="sr-only" htmlFor="profile-name">ชื่อที่แสดง</label><input className="player-input" id="profile-name" maxLength={80} onChange={(event) => setName(event.target.value)} value={name} /><div><button className="player-button player-button--primary" disabled={savingName} type="submit">{savingName ? "กำลังบันทึก" : "บันทึก"}</button><button className="player-button" onClick={() => { setEditing(false); setName(data.user.name); }} type="button">ยกเลิก</button></div></form>}
            {profileMessage ? <p className="player-profile-status" role="status">{profileMessage}</p> : null}
          </section>
          <section className="player-profile-section"><header><span className="player-eyebrow">CURRENT CASE / MEMORY</span><h2>ตอนนี้คุณกำลังสืบอะไรอยู่?</h2></header>{activeCase ? <CaseRecord item={activeCase} evidence={evidenceBySubgame.get(activeCase.subgame_id)} submission={submissionBySubgame.get(activeCase.subgame_id)} active /> : <p className="player-empty-memory">ยังไม่มีคดีที่กำลังสืบอยู่ เลือกแฟ้มเพื่อเริ่มบันทึกความคืบหน้าของคุณ</p>}</section>
          <section className="player-profile-section"><header><span className="player-eyebrow">CASE ARCHIVE / แฟ้มที่เคยเปิด</span><h2>ประวัติการสืบของคุณ</h2></header>{visibleProgress.length || legacyKaHistory.length ? <div className="player-archive-grid">{visibleProgress.map((item) => <CaseRecord item={item} evidence={evidenceBySubgame.get(item.subgame_id)} submission={submissionBySubgame.get(item.subgame_id)} key={item.subgame_id} />)}{legacyKaHistory.length ? <LegacyKaHistoryRecord items={legacyKaHistory} /> : null}</div> : <p className="player-empty-memory">ยังไม่มีแฟ้มคดีที่บันทึกไว้</p>}</section>
          <section className="player-profile-section"><header><span className="player-eyebrow">ACHIEVEMENTS / DOSSIER STAMPS</span><h2>สิ่งที่ระบบจดจำไว้</h2></header>{data.achievements.length ? <div className="player-achievement-stamps">{data.achievements.map((item) => <article className="player-achievement-stamp" key={`${item.achievement_key}:${item.subgame_id}:${item.earned_at}`}><strong>{achievementNames[item.achievement_key] ?? "กิจกรรมสำคัญในคดี"}</strong><span>{formatDate(item.earned_at)}</span></article>)}</div> : <p className="player-empty-memory">เมื่อคุณทำกิจกรรมสำคัญในคดี ระบบจะจดจำไว้ที่นี่</p>}</section>
          <section className="player-profile-section"><header><span className="player-eyebrow">RESEARCH PARTICIPATION / STATUS</span><h2>สถานะการมีส่วนร่วม</h2></header><div className="player-research-status-grid"><ResearchStatus label="Consent" value={data.consent ? `ยืนยันแล้ว · ${data.consent.consent_version}` : "ยังไม่มีข้อมูล"} /><ResearchStatus label="Submission" value={data.submissions.length ? data.submissions.map((item) => statusLabel(item.status)).join(" · ") : "ยังไม่มีข้อมูล"} /><ResearchStatus label="AI PDF" value={data.submissions.some((item) => item.ai_pdf_uploaded === 1) ? "แนบแล้วในพื้นที่ส่วนตัว" : "ยังไม่มีไฟล์ที่แนบ"} /><ResearchStatus label="หนังสือขอบคุณ" value={data.letter?.status === "emailed" ? "ส่งแล้ว" : data.letter?.status === "eligible" ? "ผ่านเกณฑ์ รอการส่ง" : data.letter?.status === "pending" ? "กำลังตรวจเกณฑ์" : "ยังไม่มีข้อมูล"} /></div></section>
          {data.notifications.length ? <section className="player-profile-section"><header><span className="player-eyebrow">RECENT NOTES</span><h2>บันทึกล่าสุดจากแฟ้ม</h2></header><div className="player-notification-list">{data.notifications.slice(0, 3).map((item) => <p key={`${item.kind}:${item.created_at}`}>{item.body_th}<span>{formatDate(item.created_at)}</span></p>)}</div></section> : null}
        </>}
      </div>
    </AppShell>
  );
}

function LegacyCaseRecord({ active = false, evidence, item, submission }: { active?: boolean; evidence?: EvidenceItem; item: ProgressItem; submission?: SubmissionItem }) {
  const slug = item.subgame_slug === "quantum" || item.subgame_slug === "space" ? item.subgame_slug : null;
  const evidenceText = evidence && evidence.evidence_total > 0 ? `หลักฐาน ${Math.min(evidence.evidence_viewed, evidence.evidence_total)} / ${evidence.evidence_total}` : "หลักฐานยังไม่มีข้อมูล";
  return <article className={`player-case-record${active ? " player-case-record--active" : ""}`}><div className="player-case-record-thumb">{slug ? <Image alt="" fill sizes="5rem" src={caseImages[slug]} /> : null}</div><div className="player-case-record-copy"><span className="player-eyebrow">{active ? "ACTIVE CASE" : "ARCHIVE"}</span><h3>{slug === "quantum" ? "THE CORRECT TRAJECTORY" : slug === "space" ? "THIRTEEN DAYS IN UTOPIA" : item.subgame_title}</h3><p>{caseLabel(item)} · {statusLabel(item.status)}</p><span>{evidenceText} · กิจกรรมล่าสุด {formatDate(item.last_activity_at)}</span>{submission ? <span>การส่ง: {statusLabel(submission.status)}</span> : null}<div className="player-case-record-actions">{slug ? <><InvestigativeAction href={`/play/node-zone/${slug}`}>{active ? "เล่นต่อ" : "เปิดแฟ้ม"}</InvestigativeAction>{evidence?.last_evidence_at ? <Link className="player-button" href={`/play/node-zone/${slug}#evidence`}>เปิดหลักฐานล่าสุด</Link> : null}</> : null}</div></div></article>;
}

function CaseRecord({ active = false, evidence, item, submission }: { active?: boolean; evidence?: EvidenceItem; item: ProgressItem; submission?: SubmissionItem }) {
  const imageKey = item.subgame_slug && caseImages[item.subgame_slug]
    ? item.subgame_slug
    : item.subgame_id === "subgame-ka-fintech"
      ? "maimee"
      : item.subgame_id === "subgame-ka-wa-ve"
        ? "wa-ve"
        : null;
  const route = kaRouteForSubgameId(item.subgame_id)
    ?? (item.subgame_slug === "quantum" || item.subgame_slug === "space" ? `/play/node-zone/${item.subgame_slug}` : null);
  if (!route || !imageKey) return <LegacyCaseRecord active={active} evidence={evidence} item={item} submission={submission} />;

  const evidenceText = evidence && evidence.evidence_total > 0
    ? `หลักฐาน ${Math.min(evidence.evidence_viewed, evidence.evidence_total)} / ${evidence.evidence_total}`
    : "หลักฐานยังไม่มีข้อมูล";
  const title = item.subgame_slug === "quantum"
    ? "THE CORRECT TRAJECTORY"
    : item.subgame_slug === "space"
      ? "THIRTEEN DAYS IN UTOPIA"
      : item.subgame_id === "subgame-ka-fintech"
        ? "คดี MAIMEE"
        : "คดี WA VE";

  return <article className={`player-case-record${active ? " player-case-record--active" : ""}`}>
    <div className="player-case-record-thumb"><Image alt="" fill sizes="5rem" src={caseImages[imageKey]} /></div>
    <div className="player-case-record-copy">
      <span className="player-eyebrow">{active ? "ACTIVE CASE" : "ARCHIVE"}</span>
      <h3>{title}</h3>
      <p>{caseLabel(item)} · {statusLabel(item.status)}</p>
      <span>{evidenceText} · กิจกรรมล่าสุด {formatDate(item.last_activity_at)}</span>
      {submission ? <span>การส่ง: {statusLabel(submission.status)}</span> : null}
      <div className="player-case-record-actions">
        <InvestigativeAction href={route}>{active ? "เล่นต่อ" : "เปิดแฟ้ม"}</InvestigativeAction>
        {evidence?.last_evidence_at ? <Link className="player-button" href={`${route}#evidence`}>เปิดหลักฐานล่าสุด</Link> : null}
      </div>
    </div>
  </article>;
}

function LegacyKaHistoryRecord({ items }: { items: ProgressItem[] }) {
  const details = items.map((item) => `${item.subgame_title}: ${statusLabel(item.status)}`).join(" · ");
  const latest = items.reduce<string | null>((value, item) => {
    if (!item.last_activity_at) return value;
    return !value || item.last_activity_at > value ? item.last_activity_at : value;
  }, null);

  return <article className="player-case-record">
    <div aria-hidden="true" className="player-case-record-thumb" />
    <div className="player-case-record-copy">
      <span className="player-eyebrow">ARCHIVE / HISTORICAL</span>
      <h3>คดี WA VE · ประวัติเดิม</h3>
      <p>บันทึก Psychology และ Human-focused Biotech แสดงรวมเป็นประวัติหนึ่งชุด</p>
      <span>{details}</span>
      <span>กิจกรรมล่าสุด {formatDate(latest)} · ข้อมูลเดิมไม่ถูกนับเป็นความคืบหน้าของคดี WA VE ปัจจุบัน</span>
    </div>
  </article>;
}

function ResearchStatus({ label, value }: { label: string; value: string }) {
  return <div className="player-research-status"><span>{label}</span><strong>{value}</strong></div>;
}
