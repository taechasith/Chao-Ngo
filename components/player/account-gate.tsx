"use client";

import Image from "next/image";
import Link from "next/link";

export type AccountStatus = "checking" | "signed-in" | "signed-out" | "unavailable";

type GatePreview = {
  eyebrow: string;
  items: Array<{ image?: string; label: string; title: string }>;
  kind: "cases" | "steps" | "identity";
};

type GateCopy = { body: string; heading: string; preview: GatePreview; trail: string[] };

const nodePreview: GatePreview = {
  eyebrow: "CASE INDEX / เปิดให้สำรวจหลังเข้าสู่ระบบ",
  kind: "cases",
  items: [
    { image: "/node-zone-hero/pre-case/AIenhanceCCTV_Zoom.png", label: "NODE ZONE", title: "เริ่มจากร่องรอย แล้วค่อยเชื่อมโยงเหตุการณ์" },
    { image: "/ka-casefiles/maimee/scene-01.png", label: "THE K.A. CASEFILES", title: "MAIMEE · FinTech และ WA VE · Bio" },
  ],
};

function copyFor(redirectTo: string): GateCopy {
  if (redirectTo === "/play") return { heading: "เก็บความคืบหน้าก่อนเปิดแฟ้ม", body: "บัญชีช่วยบันทึกแฟ้มที่คุณเลือก หลักฐานที่เปิด และความคืบหน้าของการสืบ เพื่อให้กลับมาเล่นต่อได้", preview: nodePreview, trail: ["สร้างบัญชี", "ตอบคำถามก่อนเล่น", "เลือกแฟ้มคดี"] };
  if (redirectTo.includes("/quantum")) return { heading: "เข้าสู่ระบบเพื่อเปิด THE CORRECT TRAJECTORY", body: "อ่านภาพจากกล้อง จัดลำดับเหตุการณ์ และทดสอบสมมติฐานโดยไม่เฉลยล่วงหน้า", preview: { eyebrow: "QUANTUM / LOCKED INVESTIGATION", kind: "cases", items: [{ image: "/node-zone-hero/quantum/AIenhance_CCTV.png", label: "THE CORRECT TRAJECTORY", title: "หลักฐานภาพและไทม์ไลน์สำหรับการสืบแบบเป็นระบบ" }] }, trail: ["เข้าสู่ระบบ", "ยืนยัน Consent", "เปิดคดีควอนตัม"] };
  if (redirectTo.includes("/space")) return { heading: "เข้าสู่ระบบเพื่อเปิด THIRTEEN DAYS IN UTOPIA", body: "ไล่ลำดับการตัดสินใจในสภาพแวดล้อมที่ข้อมูลไม่ครบ แล้วบันทึกเหตุผลของคุณไว้ในแฟ้ม", preview: { eyebrow: "SPACE / LOCKED INVESTIGATION", kind: "cases", items: [{ image: "/node-zone-hero/space/AIenhance_CCTV.png", label: "THIRTEEN DAYS IN UTOPIA", title: "หลักฐานภาพและจุดเปลี่ยนในไทม์ไลน์" }] }, trail: ["เข้าสู่ระบบ", "ยืนยัน Consent", "เปิดคดีอวกาศ"] };
  if (redirectTo.includes("/ka-casefiles")) return { heading: "เข้าสู่ระบบเพื่อเปิดแฟ้ม THE K.A. CASEFILES", body: "เลือกเส้นทางการสืบจาก MAIMEE · FinTech หรือ WA VE · Bio หลักฐานจะเปิดตามสถานะที่ผู้ดูแลเผยแพร่", preview: { eyebrow: "NETLOOD CITY / PUBLISHED CASES", kind: "cases", items: [{ image: "/ka-casefiles/maimee/scene-01.png", label: "MAIMEE", title: "FinTech · หลักฐานดิจิทัล การเงิน และไทม์ไลน์" }, { image: "/ka-casefiles/personnel/tete-techametakun.png", label: "WA VE", title: "Bio · สุขภาพ ระบบชีวภาพ และความไม่แน่นอน" }] }, trail: ["เข้าสู่ระบบ", "เลือกคดี", "เปิด Timeline"] };
  if (redirectTo.startsWith("/submit")) return { heading: "เข้าสู่ระบบเพื่อส่งคำตอบอย่างมีหลักฐาน", body: "เมื่อพร้อม คุณจะส่งคำอธิบาย ไทม์ไลน์ หลักฐานที่ใช้ และความไม่แน่นอนของแบบจำลองได้จากแฟ้มเดียวกัน", preview: { eyebrow: "SUBMISSION / YOUR REASONING", kind: "steps", items: [{ label: "01", title: "คำอธิบายและไทม์ไลน์" }, { label: "02", title: "หลักฐานที่ใช้สนับสนุน" }, { label: "03", title: "ความไม่แน่นอนและแนวทางลดความเสี่ยง" }] }, trail: ["เข้าสู่ระบบ", "เลือกคดี", "ส่งคำตอบเมื่อพร้อม"] };
  if (redirectTo === "/profile") return { heading: "เข้าสู่ระบบเพื่อเปิด CASE ARCHIVE ของคุณ", body: "หลังเข้าสู่ระบบ คุณจะเห็นตัวตน แฟ้มที่เคยเปิด ความคืบหน้า และ Achievement ที่ระบบบันทึกไว้", preview: { eyebrow: "CASE ARCHIVE / WHAT YOU KEEP", kind: "identity", items: [{ label: "IDENTITY", title: "ชื่อและบัญชีผู้เล่น" }, { label: "ARCHIVE", title: "คดีที่เปิด หลักฐานที่ดู และสถานะการสืบ" }, { label: "ACHIEVEMENTS", title: "ร่องรอยความคืบหน้าที่ปลดล็อก" }] }, trail: ["เข้าสู่ระบบ", "กลับไปยังแฟ้มเดิม", "ติดตามความคืบหน้า"] };
  return { heading: "เข้าสู่ระบบเพื่อดูความคืบหน้าของคุณ", body: "บัญชีช่วยให้คุณกลับมาเปิดแฟ้มเดิม ดู Achievement และติดตามสถานะการมีส่วนร่วมได้", preview: nodePreview, trail: ["เข้าสู่ระบบ", "เปิดแฟ้ม", "ติดตามความคืบหน้า"] };
}

export function AccountGate({ redirectTo, status }: { redirectTo: string; status: AccountStatus }) {
  const copy = copyFor(redirectTo);
  const checking = status === "checking";
  const unavailable = status === "unavailable";
  return (
    <section className="player-account-gate" aria-live={checking ? "polite" : undefined} aria-labelledby="account-gate-title">
      <div className="player-account-gate-copy">
        <span className="player-eyebrow">PLAYER ACCESS / {checking ? "CHECKING" : unavailable ? "SETUP PENDING" : "BEFORE THE CASE"}</span>
        <h1 id="account-gate-title">{checking ? "กำลังตรวจสอบแฟ้มของคุณ" : unavailable ? "บัญชีกำลังรอการเชื่อมต่อ D1" : copy.heading}</h1>
        <p>{checking ? "ระบบกำลังตรวจสอบพื้นที่สำหรับบันทึกความคืบหน้าและ Achievement ของคุณ" : unavailable ? "ยังไม่สามารถสร้างบัญชีหรือบันทึกความคืบหน้าได้จนกว่าฐานข้อมูลจะพร้อม" : copy.body}</p>
        {!checking && !unavailable ? <div className="player-account-gate-actions"><Link className="player-button player-button--primary" href={`/signup?next=${encodeURIComponent(redirectTo)}`}>สร้างบัญชี</Link><Link className="player-button" href={`/login?next=${encodeURIComponent(redirectTo)}`}>เข้าสู่ระบบ</Link></div> : null}
      </div>
      {!unavailable ? <aside className={`player-account-gate-preview player-account-gate-preview--${copy.preview.kind}`} aria-label={copy.preview.eyebrow}>
        <span className="player-eyebrow">{copy.preview.eyebrow}</span>
        <div className="player-account-gate-preview-list">{copy.preview.items.map((item) => <article className="player-account-gate-preview-item" key={`${item.label}:${item.title}`}>
          {item.image ? <Image alt="" className="player-account-gate-preview-image" fill sizes="(max-width: 864px) 100vw, 20rem" src={item.image} /> : null}
          <div className="player-account-gate-preview-item-copy"><b>{item.label}</b><span>{item.title}</span></div>
        </article>)}</div>
      </aside> : null}
      <aside className="player-account-gate-rail" aria-label="ลำดับก่อนเปิดแฟ้ม">{copy.trail.map((item, index) => <span key={item}><b>{String(index + 1).padStart(2, "0")}</b>{item}</span>)}</aside>
    </section>
  );
}
