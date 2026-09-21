import Image from "next/image";
import Link from "next/link";

import { AppShell } from "../../../components/player/app-shell";
import { StatusBadge } from "../../../components/player/panel";
import { EvidenceDesk } from "../../../components/player/evidence-desk";
import { getPlayerTimeline } from "../../../lib/server/content/player-evidence";

const cases = [
  {
    href: "/play/node-zone/quantum",
    image: "/node-zone-hero/quantum/AIenhance_CCTV.png",
    label: "NODE ZONE / CASE 01",
    name: "THE CORRECT TRAJECTORY",
    thai: "คดีควอนตัม",
    description: "อ่านหลักฐาน ตั้งสมมติฐาน และลองตัดสินว่าอะไรคือสิ่งที่ข้อมูลบอกเราได้จริง",
  },
  {
    href: "/play/node-zone/space",
    image: "/node-zone-hero/space/AIenhance_CCTV.png",
    label: "NODE ZONE / CASE 02",
    name: "THIRTEEN DAYS IN UTOPIA",
    thai: "คดีอวกาศ",
    description: "ตามรอยเหตุการณ์และข้อมูลจากอวกาศ เชื่อมสิ่งที่เกิดขึ้นก่อนตัดสินใจส่งคำตอบ",
  },
];

export default async function NodeZonePage() {
  const nodes = await getPlayerTimeline();
  return (
    <AppShell pageTitle="NODE ZONE">
      <div className="player-content">
        <header className="player-page-heading" data-player-reveal="heading">
          <StatusBadge>NODE ZONE / CASE ROUTES</StatusBadge>
          <h1>คุณอยากเริ่มจากหลักฐานแบบไหน?</h1>
          <p>สองคดีอยู่ในแฟ้มเดียวกัน เริ่มจากเรื่องที่คุณอยากรู้ได้เลย</p>
        </header>

        <section aria-label="เลือกคดีย่อย" className="player-route-index" data-player-reveal="primary">
          {cases.map((item) => (
            <Link className="player-route-card" href={item.href} key={item.href}>
              <Image alt={`ภาพประกอบ ${item.thai}`} className="player-case-image" fill sizes="(max-width: 864px) 100vw, 50vw" src={item.image} />
              <div className="player-route-card-content">
                <span className="player-eyebrow">{item.label}</span>
                <h2>{item.name}</h2>
                <strong className="text-sm text-white/85">{item.thai}</strong>
                <p>{item.description}</p>
                <span className="player-button player-button--primary w-fit">เปิดแฟ้มคดี</span>
              </div>
            </Link>
          ))}
        </section>

        <EvidenceDesk nodes={nodes} />

        <section className="player-ai-strip" data-player-reveal="primary">
          <div>
            <span className="player-eyebrow">GEMINI / AI คู่คิด</span>
            <h2 className="mt-2">ติดตรงไหน ลองมองจากอีกมุม</h2>
            <p>AI อาจตอบผิดได้ ตรวจคำตอบกับหลักฐานในแฟ้มคดีเสมอ</p>
          </div>
          <a className="player-button" href="https://gemini.google.com/gem/45cb7e3f0314" rel="noopener noreferrer" target="_blank">เปิด AI คู่คิด</a>
        </section>
      </div>
    </AppShell>
  );
}
