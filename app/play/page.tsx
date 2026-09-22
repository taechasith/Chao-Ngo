import Image from "next/image";
import Link from "next/link";

import { AppShell } from "../../components/player/app-shell";
import { StatusBadge } from "../../components/player/panel";

export default function PlayPage() {
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
              <span className="player-button player-button--primary">เปิด NODE ZONE</span>
            </div>
          </Link>

          <section aria-labelledby="ka-title" className="player-locked-case">
            <div className="grid gap-4">
              <span className="player-eyebrow">แฟ้มคดี 02 / ยังไม่เปิด</span>
              <h2 id="ka-title">The K.A. Casefiles</h2>
              <p>อีกชุดแฟ้มคดีที่กำลังถูกจัดเตรียม เมื่อหลักฐานพร้อม ระบบจะเปิดให้สำรวจ</p>
            </div>
            <div className="player-locked-subjects">
              <span><b>01</b>Psychology</span>
              <span><b>02</b>FinTech</span>
              <span><b>03</b>Human-focused Biotech</span>
              <span className="player-case-status player-case-status--locked"><span aria-hidden="true" />ยังไม่เปิดให้เล่น</span>
              <Link className="player-text-action" href="/play/ka-casefiles">รายละเอียดแฟ้ม →</Link>
            </div>
          </section>
        </section>
      </div>
    </AppShell>
  );
}
