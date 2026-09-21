import Image from "next/image";
import Link from "next/link";

import { AppShell } from "./app-shell";
import { StatusBadge } from "./panel";
import { getPlayerTimeline } from "../../lib/server/content/player-evidence";
import { EvidenceDesk } from "./evidence-desk";
import { CaseProgress } from "./case-progress";

export async function CaseIntroduction({
  description,
  image,
  label,
  pageTitle,
  subgameId,
  subtitle,
  title,
}: {
  description: string;
  image: string;
  label: string;
  pageTitle: string;
  subgameId: string;
  subtitle: string;
  title: string;
}) {
  const nodes = await getPlayerTimeline();
  return (
    <AppShell pageTitle={pageTitle}>
      <div className="player-content">
        <header className="player-page-heading" data-player-reveal="heading">
          <StatusBadge>{label}</StatusBadge>
          <h1>{title}</h1>
          <p className="font-bold text-white/80">{subtitle}</p>
        </header>

        <section aria-label={`พื้นที่สืบสวน ${subtitle}`} className="player-case-workspace" data-player-reveal="primary">
          <div className="player-case-visual">
            <Image alt={`ภาพจาก ${title}`} className="player-case-image" fill priority sizes="(max-width: 864px) 100vw, 66vw" src={image} />
            <span className="player-case-visual-label">CASE SCENE / บันทึกภาพ</span>
          </div>
          <aside className="player-case-control">
            <div className="grid gap-3">
              <span className="player-eyebrow">OBJECTIVE / เป้าหมาย</span>
              <h2>เริ่มจากสิ่งที่ข้อมูลบอกคุณ</h2>
              <p>{description}</p>
            </div>
            <hr className="player-control-rule" />
            <div className="grid gap-2">
              <span className="player-eyebrow">CASE STATE</span>
              <CaseProgress subgameId={subgameId} />
            </div>
            <div className="player-case-actions">
              <a className="player-button player-button--primary" href="#evidence">เปิดโต๊ะหลักฐาน</a>
              <a className="player-button" href="#timeline">ดู Timeline</a>
              <Link className="player-text-action" href={`/submit?subgameId=${subgameId}`}>ส่งคำตอบเมื่อพร้อม</Link>
            </div>
          </aside>
        </section>

        <EvidenceDesk initialSlug={subgameId.endsWith("space") ? "space" : "quantum"} nodes={nodes} />

        <section className="player-ai-strip" data-player-reveal="primary">
          <div>
            <span className="player-eyebrow">AI คู่คิด / GEMINI</span>
            <h2 className="mt-2">อยากเห็นหลักฐานจากอีกมุมหนึ่งไหม?</h2>
            <p>AI ช่วยตั้งคำถามและอธิบายแนวคิดได้ แต่จะไม่ตัดสินคำตอบแทนคุณ</p>
            <p>AI อาจตอบผิดได้ ตรวจคำตอบกับหลักฐานในแฟ้มคดีเสมอ</p>
          </div>
          <a className="player-button" href="https://gemini.google.com/gem/45cb7e3f0314" rel="noopener noreferrer" target="_blank">เปิด Gemini</a>
        </section>
      </div>
    </AppShell>
  );
}
