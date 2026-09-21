import Link from "next/link";
import { AppShell } from "../components/player/app-shell";

export default function NotFound() {
  return <AppShell pageTitle="ไม่พบแฟ้ม">
    <section className="player-submit-locked">
      <article className="player-locked-dossier">
        <span className="player-eyebrow">404 / CASE NOT FOUND</span>
        <h1>ยังไม่พบแฟ้มที่คุณกำลังหา</h1>
        <p>ลิงก์นี้อาจเปลี่ยนไป หรือแฟ้มยังไม่เปิดให้สำรวจ</p>
        <Link className="player-button player-button--primary w-fit" href="/play">กลับไปที่แฟ้มคดี</Link>
      </article>
    </section>
  </AppShell>;
}
