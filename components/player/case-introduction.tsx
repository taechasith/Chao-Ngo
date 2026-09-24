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
  instructions,
  label,
  pageTitle,
  subgameId,
  subtitle,
  title,
}: {
  description: string;
  image: string;
  instructions: { title: string; body: string }[];
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

        <section className="player-case-brief" data-player-reveal="primary" aria-label="คำแนะนำการสืบคดี">
          <div>
            <span className="player-eyebrow">CASE BRIEF / วิธีเริ่มคิด</span>
            <h2>อ่านหลักฐานเพื่อสร้างคำอธิบายของคุณ</h2>
            <p>ไฟล์ README ของคดีถูกสรุปไว้ตรงนี้แล้ว คุณไม่จำเป็นต้องออกจากเกมไปเปิดไฟล์ต้นฉบับ</p>
          </div>
          <ol>
            {instructions.map((instruction, index) => (
              <li key={instruction.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{instruction.title}</strong><p>{instruction.body}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <EvidenceDesk initialSlug={subgameId.endsWith("space") ? "space" : "quantum"} nodes={nodes} />

        <section className="player-ai-strip" data-player-reveal="primary">
          <div>
            <span className="player-eyebrow">REQUIRED / AI คู่คิด / GEMINI</span>
            <h2 className="mt-2">ก่อนส่งคำตอบ ต้องคุยกับ AI คู่คิด</h2>
            <p>ใช้ Gemini เพื่อถาม อธิบายแนวคิด และทดสอบคำอธิบายของคุณ จากนั้นบันทึกบทสนทนาเป็น PDF เพื่อแนบตอนส่งคำตอบ</p>
            <p>AI อาจตอบผิดได้ ตรวจคำตอบกับหลักฐานในแฟ้มคดีเสมอ คำตอบสุดท้ายยังเป็นของคุณ</p>
          </div>
          <a className="player-button player-button--primary" href="https://gemini.google.com/gem/45cb7e3f0314" rel="noopener noreferrer" target="_blank">เปิด Gemini แล้วกลับมาแนบ PDF</a>
        </section>
      </div>
    </AppShell>
  );
}
