"use client";

import Link from "next/link";

export type AccountStatus = "checking" | "signed-in" | "signed-out" | "unavailable";

type GateCopy = {
  body: string;
  heading: string;
  trail: string[];
};

function copyFor(redirectTo: string): GateCopy {
  if (redirectTo === "/play") return {
    heading: "เก็บความคืบหน้าก่อนเปิดแฟ้ม",
    body: "บัญชีช่วยบันทึกแฟ้มที่คุณเลือก หลักฐานที่เปิด และความคืบหน้าของการสืบไว้ให้กลับมาต่อได้",
    trail: ["สร้างบัญชี", "ตอบคำถามก่อนเล่น", "เลือกแฟ้มคดี"],
  };
  if (redirectTo.includes("/quantum")) return {
    heading: "เข้าสู่ระบบเพื่อเปิด THE CORRECT TRAJECTORY",
    body: "ระบบจะเริ่มบันทึกการสืบของคุณเมื่อคุณยินยอมเข้าร่วมการวิจัยในขั้นตอนถัดไป",
    trail: ["เข้าสู่ระบบ", "ยืนยัน Consent", "เปิดคดีควอนตัม"],
  };
  if (redirectTo.includes("/space")) return {
    heading: "เข้าสู่ระบบเพื่อเปิด THIRTEEN DAYS IN UTOPIA",
    body: "ระบบจะเริ่มบันทึกการสืบของคุณเมื่อคุณยินยอมเข้าร่วมการวิจัยในขั้นตอนถัดไป",
    trail: ["เข้าสู่ระบบ", "ยืนยัน Consent", "เปิดคดีอวกาศ"],
  };
  if (redirectTo.startsWith("/submit")) return {
    heading: "เข้าสู่ระบบเพื่อส่งคำตอบ",
    body: "บัญชีทำให้คำตอบ post-test และไฟล์ PDF บทสนทนา AI เชื่อมกับแฟ้มคดีของคุณอย่างถูกต้อง",
    trail: ["เข้าสู่ระบบ", "เลือกคดี", "ส่งคำตอบ"],
  };
  return {
    heading: "เข้าสู่ระบบเพื่อดูความคืบหน้าของคุณ",
    body: "บัญชีช่วยให้คุณกลับมาเปิดแฟ้มเดิม ดู Achievement และติดตามสถานะการมีส่วนร่วมในงานวิจัยได้",
    trail: ["เข้าสู่ระบบ", "เปิดแฟ้ม", "ติดตามความคืบหน้า"],
  };
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
        <p>{checking
          ? "ระบบกำลังตรวจสอบพื้นที่สำหรับบันทึกความคืบหน้าและ Achievement ของคุณ"
          : unavailable
            ? "ยังไม่สามารถสร้างบัญชีหรือบันทึกความคืบหน้าได้จนกว่าฐานข้อมูล D1 จะพร้อม การเข้าถึงข้อมูลผู้เล่นและการส่งคำตอบจึงยังคงปิดไว้"
            : copy.body}</p>
        {!checking && !unavailable ? <div className="player-account-gate-actions">
          <Link className="player-button player-button--primary" href={`/signup?next=${encodeURIComponent(redirectTo)}`}>สร้างบัญชี</Link>
          <Link className="player-button" href={`/login?next=${encodeURIComponent(redirectTo)}`}>เข้าสู่ระบบ</Link>
        </div> : null}
      </div>
      <aside className="player-account-gate-rail" aria-label="ลำดับก่อนเปิดแฟ้ม">
        {copy.trail.map((item, index) => <span key={item}><b>{String(index + 1).padStart(2, "0")}</b>{item}</span>)}
      </aside>
    </section>
  );
}
