import Link from "next/link";

import { AppShell } from "../../../components/player/app-shell";
import { StatusBadge } from "../../../components/player/panel";

export default function KaCasefilesPage() {
  return (
    <AppShell pageTitle="The K.A. Casefiles">
      <div className="player-content player-sealed-page">
        <header className="player-page-heading" data-player-reveal="heading">
          <StatusBadge>CASE FILE 02 / SEALED</StatusBadge>
          <h1>The K.A. Casefiles</h1>
          <p>แฟ้มนี้ยังอยู่ระหว่างการจัดเตรียม เนื้อหาจะเปิดให้สำรวจเมื่อหลักฐานและเส้นทางการเรียนรู้พร้อม</p>
        </header>

        <section className="player-sealed-layout" data-player-reveal="primary">
          <article className="player-locked-dossier">
            <span className="player-eyebrow">CASE STATUS / LOCKED</span>
            <div className="player-seal-mark" aria-hidden="true">SEALED</div>
            <h2>แฟ้มยังปิดผนึกอยู่</h2>
            <p>เนื้อหายังไม่ถูกเผยแพร่ จึงยังไม่มีคดีหรือหลักฐานให้คุณสำรวจในตอนนี้</p>
            <p className="player-locked-reason"><strong>สถานะปัจจุบัน</strong>รอทีมโครงการเปิดเผยแฟ้มเมื่อการจัดเตรียมเสร็จสิ้น</p>
            <div className="player-case-actions">
              <Link className="player-button player-button--primary w-fit" href="/play">กลับไปเลือกแฟ้มคดี</Link>
              <Link className="player-text-action" href="/play/node-zone">เปิด NODE ZONE แทน</Link>
            </div>
          </article>
          <aside className="player-sealed-index" aria-label="หัวข้อที่จะอยู่ในแฟ้มนี้">
            <span className="player-eyebrow">CONTENT INDEX / เมื่อเปิดแฟ้ม</span>
            <h2>เนื้อหาที่จะอยู่ในแฟ้มนี้</h2>
            <ol>
              <li><b>01</b><span>Psychology</span></li>
              <li><b>02</b><span>FinTech</span></li>
              <li><b>03</b><span>Human-focused Biotech</span></li>
            </ol>
            <p>หัวข้อเหล่านี้ยังไม่ใช่คดีที่เล่นได้ และจะไม่เปิดจนกว่าจะมีการเผยแพร่จากทีมโครงการ</p>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}
