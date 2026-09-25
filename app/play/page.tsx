import Image from "next/image";
import Link from "next/link";
import { AppShell } from "../../components/player/app-shell";
import { StatusBadge } from "../../components/player/panel";
import { InvestigativeActionMarker } from "../../components/player/investigative-action";
import { getPlayerCatalog } from "../../lib/server/content/player-catalog";

const artwork: Record<string, { image: string; number: string; description: string }> = {
  "node-zone": { image: "/node-zone-hero/pre-case/AIenhanceCCTV_Zoom.png", number: "01", description: "บางสิ่งอธิบายได้ด้วยวิทยาศาสตร์ บางสิ่งยังต้องตามหา เชื่อมร่องรอยผ่านคดีควอนตัมและอวกาศ" },
  "ka-casefiles": { image: "/ka-casefiles/maimee/scene-01.png", number: "02", description: "ย้อนรอยเหตุการณ์ใน NetLood City ผ่านหลักฐาน ผู้คน และระบบที่อยู่เบื้องหลังความสูญเสีย" },
};

export default async function PlayPage() {
  const catalog = await getPlayerCatalog();
  return <AppShell pageTitle="แฟ้มคดี"><div className="player-case-index">
    <header className="player-page-heading" data-player-reveal="heading"><StatusBadge>CASE INDEX / แฟ้มคดี</StatusBadge><h1>ความสงสัยของคุณ<br />จะพาไปที่ไหน?</h1><p>เลือกแฟ้มที่อยากสำรวจ เปิดหลักฐาน แล้วค่อย ๆ สร้างคำอธิบายของคุณเอง</p></header>
    <div className="player-case-index-intro"><span className="player-eyebrow">เลือกเส้นทางการสืบสวน</span><p>แต่ละคดีเริ่มแยกกันได้</p></div>
    {catalog === null ? <section className="player-panel" role="status"><h2>ยังโหลดแฟ้มคดีไม่ได้</h2><p>ลองโหลดหน้าอีกครั้งเมื่อการเชื่อมต่อพร้อม</p></section> : !catalog.length ? <section className="player-panel"><h2>ยังไม่มีแฟ้มที่เปิดให้เล่น</h2><p>กลับมาดูได้เมื่อมีการเปิดแฟ้มใหม่</p></section> : <section aria-label="รายการแฟ้มคดี" className="player-case-index-layout" data-guide="case-index" data-player-reveal="primary">
      {catalog.map(game => {
        const art = artwork[game.slug];
        if (!art) return null;
        const playable = game.status === "playable" && game.cases.some(item => item.status === "playable");
        const contents = <>
          <Image alt={`ภาพจากแฟ้ม ${game.title}`} className="player-case-image" fill priority sizes="(max-width:864px) 100vw, 50vw" src={art.image} />
          <div className="player-case-dossier-content"><span className="player-eyebrow">แฟ้ม {art.number} / {game.slug === "node-zone" ? "SCIENCE & THE UNKNOWN" : "NETLOOD CITY"}</span><h2>{game.title}</h2><p>{art.description}</p><span className="player-case-status"><span aria-hidden="true" />{playable ? `เปิดให้เล่น ${game.cases.filter(item => item.status === "playable").length} คดีย่อย` : "ยังไม่เปิดให้เล่น"}</span>{playable ? <InvestigativeActionMarker>เปิดแฟ้มคดี</InvestigativeActionMarker> : <span>กลับมาตรวจสอบการเปิดแฟ้มได้ภายหลัง</span>}</div>
        </>;
        return playable ? <Link className="player-case-dossier" href={`/play/${game.slug}`} key={game.id}>{contents}</Link> : <article className="player-case-dossier" key={game.id}>{contents}</article>;
      })}
    </section>}
    <div className="player-index-note"><span>มีแฟ้มที่เปิดค้างไว้? กลับไปสืบต่อจากโปรไฟล์ของคุณ</span><Link className="player-text-action" href="/profile">ดูความคืบหน้า →</Link></div>
  </div></AppShell>;
}
