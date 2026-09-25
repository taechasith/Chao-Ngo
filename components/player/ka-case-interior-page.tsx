import { getCasePublication } from "../../lib/server/content/player-catalog";
import Link from "next/link";

import { kaGame, kaNodeLabels, kaSubmissionGuide, kaSubgames, kaTimelineNodes, type KaSubgameSlug } from "../../lib/ka-casefiles";
import { getPlayerTimeline, type PlayerTimelineNode } from "../../lib/server/content/player-evidence";
import { CaseProgress } from "./case-progress";
import { EvidenceDesk } from "./evidence-desk";
import { GameSessionStarter } from "./game-session-starter";
import { CasePanel, DecisionPanel, DossierPanel, EvidenceCell, PageIntro, PlayerShell, SystemStatus, UtilityStrip } from "./interior-system";
import { InvestigativeAction } from "./investigative-action";

type KaCaseInteriorPageProps = {
  caseSlug: KaSubgameSlug;
  description: string;
  image: string;
  imageAlt: string;
  instructions: Array<{ body: string; title: string }>;
  meta: string;
  pageTitle: string;
};

export async function KaCaseInteriorPage({
  caseSlug,
  description,
  image,
  imageAlt,
  instructions,
  meta,
  pageTitle,
}: KaCaseInteriorPageProps) {
  const subgame = kaSubgames[caseSlug];
  const publication = await getCasePublication(subgame.id);
  if (publication !== "playable") return <PlayerShell pageTitle={pageTitle}><section className="player-panel"><span className="player-eyebrow">สถานะแฟ้มคดี</span><h1 className="mt-3 text-2xl">{publication === "closed" ? "แฟ้มนี้ยังไม่เปิดให้เล่น" : "ยังตรวจสอบสถานะแฟ้มไม่ได้"}</h1><p className="mt-3">กลับไปเลือกแฟ้มที่เปิดให้สำรวจ หรือลองใหม่ภายหลัง</p><Link className="player-button mt-4" href="/play">กลับไปยังแฟ้มคดี</Link></section></PlayerShell>;
  const fallbackNodes: PlayerTimelineNode[] = kaTimelineNodes[caseSlug];
  const publishedTimeline = await getPlayerTimeline({
    gameSlug: kaGame.slug,
    r2KeyPrefix: "games/ka-casefiles/",
  });
  const publishedNodes = publishedTimeline?.filter((node) =>
    node.slug === "netlood-city" || node.slug === "personnel" || node.slug === caseSlug,
  );
  const nodes = publishedNodes?.some((node) => node.slug === caseSlug && node.files.length > 0)
    ? publishedNodes
    : fallbackNodes;
  const activeNode = nodes.find((node) => node.slug === caseSlug);

  return (
    <PlayerShell pageTitle={pageTitle}>
      <GameSessionStarter gameId={kaGame.id} subgameId={subgame.id} />
      <div className="quantum-interior">
        <PageIntro description={description} eyebrow={`${kaGame.title} / ${subgame.subtitle}`} meta={meta} title={subgame.title} />
        <section className="quantum-opening-grid" data-player-reveal="primary">
          <DossierPanel alt={imageAlt} eyebrow={`CASE SCENE / ${subgame.subtitle}`} image={image} subtitle="อ่านหลักฐาน ตั้งสมมติฐาน และออกแบบการป้องกันจากสิ่งที่หลักฐานรองรับ" title="เริ่มจากสิ่งที่ข้อมูลบอกคุณ">
            <UtilityStrip>
              <Link href="#timeline">เปิดบันทึกคดี</Link>
              <Link href="#evidence">ดูหลักฐาน</Link>
              <Link data-guide="ka-submit" href={`/submit?subgameId=${subgame.id}`}>ส่งภารกิจเมื่อพร้อม</Link>
            </UtilityStrip>
          </DossierPanel>
          <DecisionPanel guideTarget="ka-objective" action={<InvestigativeAction data-guide="ka-objective-action" href="#evidence">เปิดโต๊ะหลักฐาน</InvestigativeAction>} eyebrow="OBJECTIVE / ภารกิจ" title="สร้างแบบจำลองที่หลักฐานรองรับ">
            <p>{description}</p>
            <SystemStatus label="CASE STATE" tone="teal">กำลังจัดวางหลักฐาน</SystemStatus>
            <div className="interior-progress-copy"><CaseProgress subgameId={subgame.id} /></div>
            <p className="interior-microcopy">แยกสิ่งที่ยืนยันได้ สิ่งที่อนุมานได้ และสิ่งที่ยังไม่ทราบ ก่อนออกแบบวิธีลดความเสี่ยง</p>
          </DecisionPanel>
        </section>

        <section className="quantum-thinking-grid" data-player-reveal="primary">
          <CasePanel guideTarget="ka-brief" eyebrow="CASE BRIEF / วิธีเริ่มคิด" title="อ่านคดีอย่างเป็นระบบ">
            <p>คุณไม่ต้องรีบหาคำตอบเดียว ให้เริ่มจากสิ่งที่แต่ละไฟล์ยืนยันได้ แล้วตรวจสอบว่าหลักฐานชิ้นใดทำให้สมมติฐานของคุณเข้มแข็งขึ้นหรืออ่อนลง</p>
            <ol className="interior-thinking-list">
              {instructions.map((instruction, index) => <li key={instruction.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{instruction.title}</strong><p>{instruction.body}</p></div>
              </li>)}
            </ol>
          </CasePanel>
          <aside className="quantum-memory-rail">
            <SystemStatus label="MEMORY / CURRENT FOCUS" tone="ember">หลักฐานที่กำลังเรียกคุณ</SystemStatus>
            {activeNode?.files.slice(0, 3).map((file, index) => <EvidenceCell index={index + 1} key={file.id} kind={file.kind.toUpperCase()} title={file.title} />)}
          </aside>
        </section>

        <div className="quantum-evidence-anchor">
          <EvidenceDesk gameTitle={kaGame.title} guideScope="ka-case" initialSlug={caseSlug} nodeLabels={kaNodeLabels} nodes={nodes} subgameId={subgame.id} />
        </div>

        <DecisionPanel guideTarget="ka-submit" action={<InvestigativeAction href={`/submit?subgameId=${subgame.id}`}>เปิดภารกิจส่งคำตอบ</InvestigativeAction>} eyebrow="SUBMISSION / NETLOOD CITY" title={kaSubmissionGuide.title}>
          <p>ส่งได้เป็นข้อความในระบบหรือไฟล์หนึ่งชิ้น โดยใช้แบบจำลองเชิงสาเหตุ หลักฐานอย่างน้อยสามชิ้น และแนวคิดเทคโนโลยีหรือระบบที่อาจช่วยลดความสูญเสียได้</p>
          <ul className="interior-thinking-list">
            {kaSubmissionGuide.rubric.slice(0, 3).map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><div><p>{item}</p></div></li>)}
          </ul>
        </DecisionPanel>
      </div>
    </PlayerShell>
  );
}
