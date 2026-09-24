import Image from "next/image";
import Link from "next/link";

import { AppShell } from "../../components/player/app-shell";
import { StatusBadge } from "../../components/player/panel";
import { InvestigativeActionMarker } from "../../components/player/investigative-action";
import { isPlayerGamePlayable } from "../../lib/server/content/player-evidence";

export default async function PlayPage() {
  const kaPlayable = await isPlayerGamePlayable("ka-casefiles");
  return (
    <AppShell pageTitle="แฟ้มคดี">
      <div className="player-case-index">
        <header className="player-page-heading" data-player-reveal="heading">
          <StatusBadge>CASE INDEX / จุดเริ่มต้น</StatusBadge>
          <h1>แฟ้มไหนกำลังเรียกคุณอยู่?</h1>
          <p>เลือกจากสิ่งที่คุณสงสัย ไม่ต้องเลือกจากสิ่งที่คิดว่าตัวเองเก่ง</p>
        </header>

        <section aria-label="รายการแฟ้มคดี" className="player-case-index-layout" data-player-reveal="primary">
          <Link className="player-case-dossier" href="/play/node-zone">
            <Image
              alt="ภาพจากแฟ้มคดี NODE ZONE"
              className="player-case-image"
              fill
              priority
              sizes="(max-width: 864px) 100vw, 66vw"
              src="/node-zone-hero/pre-case/AIenhanceCCTV_Zoom.png"
            />
            <div className="player-case-dossier-content">
              <span className="player-eyebrow">แฟ้มคดี 01 / เล่นได้แล้ว</span>
              <h2>NODE ZONE</h2>
              <p>ตามรอยหลักฐานผ่านเรื่องราวที่เชื่อมควอนตัมและอวกาศ คุณเลือกเริ่มจากคดีไหนก่อนก็ได้</p>
              <span className="text-sm text-white/60">2 คดีย่อย · Quantum · Space</span>
              <span className="player-case-status"><span aria-hidden="true" />พร้อมสำรวจ · ยังไม่เริ่ม</span>
              <InvestigativeActionMarker>เปิด NODE ZONE</InvestigativeActionMarker>
            </div>
          </Link>

          <section aria-labelledby="ka-title" className={`player-locked-case${kaPlayable ? " player-locked-case--available" : ""}`}>
            <div className="grid gap-4">
              <span className="player-eyebrow">แฟ้มคดี 02 / {kaPlayable ? "เล่นได้แล้ว" : "รอการเผยแพร่"}</span>
              <h2 id="ka-title">The K.A. Casefiles</h2>
              <p>NetLood City เปิดแฟ้มคดีสองเส้นทางให้สำรวจผ่านหลักฐาน และให้คุณออกแบบวิธีลดความสูญเสียจากสิ่งที่พบ</p>
            </div>
            <div className="player-locked-subjects">
              <span><b>01</b>คดี MAIMEE · FinTech</span>
              <span><b>02</b>คดี WA VE · Bio</span>
              <span className="player-case-status"><span aria-hidden="true" />{kaPlayable ? "พร้อมสำรวจ" : "ผู้ดูแลยังไม่เผยแพร่"}</span>
              {kaPlayable ? <Link className="player-text-action" href="/play/ka-casefiles">เปิด THE K.A. CASEFILES →</Link> : <span className="text-sm text-white/55">แฟ้มนี้จะเปิดเมื่อหลักฐานพร้อมสำหรับการสำรวจ</span>}
            </div>
          </section>
        </section>
      </div>
    </AppShell>
  );
}
