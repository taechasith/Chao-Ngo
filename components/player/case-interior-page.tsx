import Link from "next/link";

import { CaseProgress } from "./case-progress";
import { EvidenceDesk } from "./evidence-desk";
import { GameSessionStarter } from "./game-session-starter";
import { CasePanel, DecisionPanel, DossierPanel, EmptyState, EvidenceCell, PageIntro, PlayerShell, SystemStatus, UtilityStrip } from "./interior-system";
import { getPlayerAssistantUrl, getPlayerTimeline } from "../../lib/server/content/player-evidence";
import { InvestigativeAction } from "./investigative-action";

export type CaseInteriorPageProps = {
  pageTitle: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  description: string;
  meta: string;
  image: string;
  imageAlt: string;
  subgameId: string;
  timelineSlug: string;
  instructions: { title: string; body: string }[];
};

export async function CaseInteriorPage({ pageTitle, eyebrow, title, subtitle, description, meta, image, imageAlt, subgameId, timelineSlug, instructions }: CaseInteriorPageProps) {
  const [nodes, assistantUrl] = await Promise.all([
    getPlayerTimeline(),
    getPlayerAssistantUrl("node-zone"),
  ]);
  const activeNode = nodes?.find((node) => node.slug === timelineSlug);

  return (
    <PlayerShell pageTitle={pageTitle}>
      <GameSessionStarter subgameId={subgameId} />
      <div className="quantum-interior">
        <PageIntro description={description} eyebrow={eyebrow} meta={meta} title={title} />
        <section className="quantum-opening-grid" data-player-reveal="primary">
          <DossierPanel alt={imageAlt} eyebrow={`CASE SCENE / ${subtitle}`} image={image} subtitle="อ่านหลักฐาน ตั้งสมมติฐาน และตัดสินใจด้วยคำอธิบายของคุณเอง" title="เริ่มจากสิ่งที่ข้อมูลบอกคุณ">
            <UtilityStrip><Link href="#timeline">เปิด Timeline</Link><Link href="#evidence">ดูหลักฐาน</Link><Link data-guide="case-submit" href={`/submit?subgameId=${subgameId}`}>ส่งเมื่อพร้อม</Link></UtilityStrip>
          </DossierPanel>
          <DecisionPanel guideTarget="case-objective" action={<InvestigativeAction data-guide="case-objective-action" href="#evidence">เปิดโต๊ะหลักฐาน</InvestigativeAction>} eyebrow="OBJECTIVE / เป้าหมาย" title="คำตอบที่ดีต้องอธิบายได้">
            <p>{description}</p>
            <SystemStatus label="CASE STATE" tone="teal">กำลังจัดวางหลักฐาน</SystemStatus>
            <div className="interior-progress-copy"><CaseProgress subgameId={subgameId} /></div>
            <p className="interior-microcopy">คุณกลับมาเปิดหลักฐานซ้ำและเปลี่ยนสมมติฐานได้เสมอ</p>
          </DecisionPanel>
        </section>
        <section className="quantum-thinking-grid" data-player-reveal="primary">
          <CasePanel guideTarget="case-brief" eyebrow="CASE BRIEF / วิธีเริ่มคิด" title="อ่านแฟ้มเหมือนนักสืบวิทยาศาสตร์">
            <p>ไฟล์ README ของคดีถูกสรุปไว้ตรงนี้แล้ว คุณไม่จำเป็นต้องออกจากเกมไปเปิดไฟล์ต้นฉบับ</p>
            <ol className="interior-thinking-list">{instructions.map((instruction, index) => <li key={instruction.title}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{instruction.title}</strong><p>{instruction.body}</p></div></li>)}</ol>
          </CasePanel>
          <aside className="quantum-memory-rail">
            <SystemStatus label="MEMORY / CURRENT FOCUS" tone="ember">หลักฐานที่กำลังเรียกคุณ</SystemStatus>
            {activeNode?.files.length ? <div className="interior-evidence-preview" aria-label={`ตัวอย่างหลักฐานใน${subtitle}`}>{activeNode.files.slice(0, 3).map((file, index) => <EvidenceCell index={index + 1} key={file.id} kind={file.kind.toUpperCase()} title={file.title} />)}</div> : <EmptyState description="ระบบยังโหลดรายการหลักฐานไม่สำเร็จ ลองเปิดแฟ้มอีกครั้งเพื่อกลับไปที่โต๊ะหลักฐาน" title="ยังจัดวางหลักฐานไม่ได้" />}
          </aside>
        </section>
        <div className="quantum-evidence-anchor" id="evidence"><EvidenceDesk initialSlug={timelineSlug} nodes={nodes} /></div>
        <DecisionPanel guideTarget="case-ai" action={<InvestigativeAction href={assistantUrl} intent="secondary" rel="noopener noreferrer" target="_blank">เปิด Gemini ↗</InvestigativeAction>} eyebrow="REQUIRED / AI คู่คิด / GEMINI" title="ก่อนส่งคำตอบ ต้องคุยกับ AI คู่คิด">
          <p>ใช้ Gemini เพื่อถาม อธิบายแนวคิด และทดสอบคำอธิบายของคุณ จากนั้นบันทึกบทสนทนาเป็น PDF เพื่อแนบตอนส่งคำตอบ</p>
          <p>AI อาจตอบผิดได้ ตรวจคำตอบกับหลักฐานในแฟ้มคดีเสมอ คำตอบสุดท้ายยังเป็นของคุณ</p>
        </DecisionPanel>
      </div>
    </PlayerShell>
  );
}
