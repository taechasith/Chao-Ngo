import Link from "next/link";

import { AppShell } from "../../../components/player/app-shell";
import { StatusBadge } from "../../../components/player/panel";

export default function KaCasefilesPage() {
  return (
    <AppShell pageTitle="The K.A. Casefiles">
      <div className="player-content">
        <header className="player-page-heading" data-player-reveal="heading">
          <StatusBadge>แฟ้มคดี 02 / ยังไม่เปิด</StatusBadge>
          <h1>The K.A. Casefiles</h1>
          <p>อีกชุดแฟ้มคดีที่กำลังถูกจัดเตรียม เมื่อหลักฐานพร้อม ระบบจะเปิดให้สำรวจ</p>
        </header>

        <section className="player-submit-locked" data-player-reveal="primary">
          <article className="player-locked-dossier">
            <span className="player-eyebrow">CASE STATUS / LOCKED</span>
            <h2 className="font-display text-4xl leading-none text-white">แฟ้มนี้ยังปิดผนึกอยู่</h2>
            <p>เนื้อหายังไม่ถูกเผยแพร่ จึงยังไม่มีคดีหรือหลักฐานให้คุณเปิดดู</p>
            <p className="player-locked-reason"><strong>สถานะปัจจุบัน</strong>รอการเปิดเผยแฟ้มจากทีมโครงการ</p>
            <Link className="player-button w-fit" href="/play">กลับไปเลือกแฟ้มคดี</Link>
          </article>
          <aside className="player-locked-rail" aria-label="หัวข้อที่กำลังจัดทำ">
            <span><b>01</b>Psychology</span>
            <span><b>02</b>FinTech</span>
            <span><b>03</b>Human-focused Biotech</span>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}
