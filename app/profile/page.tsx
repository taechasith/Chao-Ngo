"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { kaRouteForSubgameId } from "../../lib/ka-casefiles";
import { ProfileIdentity } from "../../components/player/profile-identity";
import { ResearchProfileEditor } from "../../components/player/research-profile-editor";
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
  user: { createdAt?: string; email: string; name: string; image?: string | null };
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

export default function ProfilePage() {
  return <AppShell pageTitle="โปรไฟล์และความคืบหน้า"><ProfileContent /></AppShell>;
}

function ProfileContent() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("กำลังเปิดแฟ้มประวัติของคุณ");
  const [researchMessage, setResearchMessage] = useState("กำลังอ่านความคืบหน้า…");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const profileResponse = await fetch("/api/player-profile", { signal: controller.signal, credentials: "same-origin" });
        if (!profileResponse.ok) throw new Error("PROFILE_UNAVAILABLE");
        const { user } = await profileResponse.json() as { user: ProfileData["user"] };
        setData({ user, achievements: [], consent: null, evidence: [], letter: null, notifications: [], progress: [], submissions: [] });
        setLoadingMessage("");
        const progressResponse = await fetch("/api/player-progress", { signal: controller.signal, credentials: "same-origin" });
        const body = await progressResponse.json() as Omit<ProfileData, "user" | "notifications"> & { code?: string };
        if (!progressResponse.ok) {
          setResearchMessage(body.code === "RESEARCH_CONSENT_REQUIRED" ? "คุณยังไม่ได้ยืนยันการเข้าร่วมวิจัย อ่านรายละเอียดและตัดสินใจได้ที่หน้าก่อนเริ่มเล่น" : body.code === "RESEARCH_CONSENT_UNAVAILABLE" ? "ขณะนี้การเก็บข้อมูลวิจัยยังไม่เปิดให้ใช้งาน" : "ยังอ่านความคืบหน้าไม่ได้ กรุณาลองอีกครั้ง");
          return;
        }
        const notificationsResponse = await fetch("/api/player-notifications", { signal: controller.signal, credentials: "same-origin" });
        const notes = notificationsResponse.ok ? await notificationsResponse.json() as { notifications?: ProfileData["notifications"] } : {};
        setData({ ...body, user, notifications: notes.notifications ?? [] });
        setResearchMessage("");
      } catch {
        if (!controller.signal.aborted) { setLoadingMessage("ยังเปิดข้อมูลโปรไฟล์ไม่ได้ ลองโหลดอีกครั้ง"); setResearchMessage("ยังอ่านความคืบหน้าไม่ได้ ลองโหลดอีกครั้ง"); }
      }
    })();
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

  return (
      <div className="player-content">
        <header className="player-page-heading" data-player-reveal="heading"><StatusBadge>PLAYER PROFILE / CASE ARCHIVE</StatusBadge><h1>แฟ้มที่คุณเคยเปิด</h1><p>กลับมาดูว่าคุณกำลังสืบอะไร เปิดหลักฐานไว้แค่ไหน และสถานะงานวิจัยของคุณอยู่ตรงไหน</p></header>
        {!data ? <section className="player-profile-layout" data-player-reveal="primary"><Panel><p className="player-empty-memory" role="status">{loadingMessage}</p></Panel></section> : <>
          <ProfileIdentity user={data.user} onSaved={(user) => setData(current => current ? { ...current, user: { ...current.user, ...user } } : current)} />
          <ResearchProfileEditor />
          {researchMessage ? <Panel><span className="player-eyebrow">ความคืบหน้าการเข้าร่วม</span><p className="mt-3" role="status">{researchMessage}</p><Link className="player-button mt-4" href="/onboarding">รายละเอียดก่อนเริ่มเล่น</Link></Panel> : <>
          <section className="player-profile-section"><header><span className="player-eyebrow">CURRENT CASE / MEMORY</span><h2>ตอนนี้คุณกำลังสืบอะไรอยู่?</h2></header>{activeCase ? <CaseRecord item={activeCase} evidence={evidenceBySubgame.get(activeCase.subgame_id)} submission={submissionBySubgame.get(activeCase.subgame_id)} active /> : <p className="player-empty-memory">ยังไม่มีคดีที่กำลังสืบอยู่ เลือกแฟ้มเพื่อเริ่มบันทึกความคืบหน้าของคุณ</p>}</section>
          <section className="player-profile-section"><header><span className="player-eyebrow">CASE ARCHIVE / แฟ้มที่เคยเปิด</span><h2>ประวัติการสืบของคุณ</h2></header>{visibleProgress.length || legacyKaHistory.length ? <div className="player-archive-grid">{visibleProgress.map((item) => <CaseRecord item={item} evidence={evidenceBySubgame.get(item.subgame_id)} submission={submissionBySubgame.get(item.subgame_id)} key={item.subgame_id} />)}{legacyKaHistory.length ? <LegacyKaHistoryRecord items={legacyKaHistory} /> : null}</div> : <p className="player-empty-memory">ยังไม่มีแฟ้มคดีที่บันทึกไว้</p>}</section>
          <section className="player-profile-section"><header><span className="player-eyebrow">ACHIEVEMENTS / DOSSIER STAMPS</span><h2>สิ่งที่ระบบจดจำไว้</h2></header>{data.achievements.length ? <div className="player-achievement-stamps">{data.achievements.map((item) => <article className="player-achievement-stamp" key={`${item.achievement_key}:${item.subgame_id}:${item.earned_at}`}><strong>{achievementNames[item.achievement_key] ?? "กิจกรรมสำคัญในคดี"}</strong><span>{formatDate(item.earned_at)}</span></article>)}</div> : <p className="player-empty-memory">เมื่อคุณทำกิจกรรมสำคัญในคดี ระบบจะจดจำไว้ที่นี่</p>}</section>
          <section className="player-profile-section"><header><span className="player-eyebrow">RESEARCH PARTICIPATION / STATUS</span><h2>สถานะการมีส่วนร่วม</h2></header><div className="player-research-status-grid"><ResearchStatus label="Consent" value={data.consent ? `ยืนยันแล้ว · ${data.consent.consent_version}` : "ยังไม่มีข้อมูล"} /><ResearchStatus label="Submission" value={data.submissions.length ? data.submissions.map((item) => statusLabel(item.status)).join(" · ") : "ยังไม่มีข้อมูล"} /><ResearchStatus label="AI PDF" value={data.submissions.some((item) => item.ai_pdf_uploaded === 1) ? "แนบแล้วในพื้นที่ส่วนตัว" : "ยังไม่มีไฟล์ที่แนบ"} /><ResearchStatus label="หนังสือขอบคุณ" value={data.letter?.status === "emailed" ? "ส่งแล้ว" : data.letter?.status === "eligible" ? "ผ่านเกณฑ์ รอการส่ง" : data.letter?.status === "pending" ? "กำลังตรวจเกณฑ์" : "ยังไม่มีข้อมูล"} /></div></section>
          {data.notifications.length ? <section className="player-profile-section"><header><span className="player-eyebrow">RECENT NOTES</span><h2>บันทึกล่าสุดจากแฟ้ม</h2></header><div className="player-notification-list">{data.notifications.slice(0, 3).map((item) => <p key={`${item.kind}:${item.created_at}`}>{item.body_th}<span>{formatDate(item.created_at)}</span></p>)}</div></section> : null}
          </>}
        </>}
      </div>
  );
}

function LegacyCaseRecord({ active = false, evidence, item, submission }: { active?: boolean; evidence?: EvidenceItem; item: ProgressItem; submission?: SubmissionItem }) {
  const slug = item.subgame_slug === "quantum" || item.subgame_slug === "space" ? item.subgame_slug : null;
  const evidenceText = evidence && evidence.evidence_total > 0 ? `หลักฐาน ${Math.min(evidence.evidence_viewed, evidence.evidence_total)} / ${evidence.evidence_total}` : "หลักฐานยังไม่มีข้อมูล";
  return <article className={`player-case-record${active ? " player-case-record--active" : ""}`}><div className="player-case-record-thumb">{slug ? <Image alt="" fill sizes="(max-width: 496px) 100vw, 240px" src={caseImages[slug]} /> : null}</div><div className="player-case-record-copy"><span className="player-eyebrow">{active ? "ACTIVE CASE" : "ARCHIVE"}</span><h3>{slug === "quantum" ? "THE CORRECT TRAJECTORY" : slug === "space" ? "THIRTEEN DAYS IN UTOPIA" : item.subgame_title}</h3><p>{caseLabel(item)} · {statusLabel(item.status)}</p><span>{evidenceText} · กิจกรรมล่าสุด {formatDate(item.last_activity_at)}</span>{submission ? <span>การส่ง: {statusLabel(submission.status)}</span> : null}<div className="player-case-record-actions">{slug ? <><InvestigativeAction href={`/play/node-zone/${slug}`}>{active ? "เล่นต่อ" : "เปิดแฟ้ม"}</InvestigativeAction>{evidence?.last_evidence_at ? <Link className="player-button" href={`/play/node-zone/${slug}#evidence`}>เปิดหลักฐานล่าสุด</Link> : null}</> : null}</div></div></article>;
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
    <div className="player-case-record-thumb"><Image alt="" fill sizes="(max-width: 496px) 100vw, 240px" src={caseImages[imageKey]} /></div>
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
