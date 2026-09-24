import Image from "next/image";
import Link from "next/link";

import { AppShell } from "../../../components/player/app-shell";
import { StatusBadge } from "../../../components/player/panel";
import { EvidenceDesk } from "../../../components/player/evidence-desk";
import { getPlayerAssistantUrl, getPlayerTimeline } from "../../../lib/server/content/player-evidence";
import { InvestigativeAction, InvestigativeActionMarker } from "../../../components/player/investigative-action";

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
  const [nodes, assistantUrl] = await Promise.all([
    getPlayerTimeline(),
    getPlayerAssistantUrl("node-zone"),
  ]);
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
                <InvestigativeActionMarker>เปิดแฟ้มคดี</InvestigativeActionMarker>
              </div>
            </Link>
          ))}
        </section>

        <EvidenceDesk guideScope="node-zone" nodes={nodes} />

        <section className="player-ai-strip" data-guide="node-zone-ai" data-player-reveal="primary">
          <div>
            <span className="player-eyebrow">REQUIRED / GEMINI / AI คู่คิด</span>
            <h2 className="mt-2">ใช้ AI คู่คิดก่อนส่งคำตอบ</h2>
            <p>เปิด Gemini เพื่อทดสอบคำอธิบายของคุณ แล้วบันทึกบทสนทนาเป็น PDF สำหรับขั้นตอนส่งคำตอบ</p>
          </div>
          <InvestigativeAction href={assistantUrl} rel="noopener noreferrer" target="_blank">เปิด Gemini ↗</InvestigativeAction>
        </section>
        <div data-guide="node-zone-submit"><InvestigativeAction href="/submit">ส่งคำตอบเมื่อพร้อม</InvestigativeAction></div>
      </div>
    </AppShell>
  );
}
