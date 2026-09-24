import Link from "next/link";

import { SublevelStudioLandingPage } from "../components/player/sublevel-studio-hero";

const landingRuntimeScript = String.raw`(() => {
  const replaceBrand = (value) => value
    .replace(/sublevel\.studio/gi, "เจ้าเงาะ")
    .replace(/sublevel/gi, "เจ้าเงาะ")
    .replace(/hello@เจ้าเงาะ/gi, "mind@chao-ngo");
  const adapt = (frame) => {
    if (!frame || frame.__chaoNgoAdapted) return false;
    const doc = frame.contentDocument;
    if (!doc || doc.readyState !== "complete") return false;
    frame.__chaoNgoAdapted = true;
    doc.documentElement.lang = "th";
    doc.title = "เจ้าเงาะ — แฟ้มคดีเชิงวิทยาศาสตร์";
    if (!doc.head.querySelector("[data-chao-ngo-adaptation]")) {
      const style = doc.createElement("style");
      style.dataset.chaoNgoAdaptation = "true";
      style.textContent = "#topnav{visibility:hidden!important;pointer-events:none!important}#loader{color:transparent!important}#loader span{visibility:hidden!important}";
      doc.head.appendChild(style);
    }
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeValue) node.nodeValue = replaceBrand(node.nodeValue);
      node = walker.nextNode();
    }
    doc.body.querySelectorAll("[aria-label],[title],[alt]").forEach((element) => {
      ["aria-label", "title", "alt"].forEach((attribute) => {
        const value = element.getAttribute(attribute);
        if (value) element.setAttribute(attribute, replaceBrand(value));
      });
    });
    return true;
  };
  const timer = window.setInterval(() => {
    if (adapt(document.querySelector(".player-landing-frame"))) window.clearInterval(timer);
  }, 250);
})();`;

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <script dangerouslySetInnerHTML={{ __html: landingRuntimeScript }} />
      <section
        aria-label="หน้าแรกแบบอินเทอร์แอกทีฟ"
        className="relative h-[100svh] min-h-[32rem] border-b border-white/10"
      >
        <SublevelStudioLandingPage />
        <nav aria-label="เจ้าเงาะ" className="landing-project-nav">
          <Link className="landing-project-brand" href="/">เจ้าเงาะ<span>/</span></Link>
          <div className="landing-project-links">
            <Link href="/play">แฟ้มคดี</Link>
            <Link href="/settings">ตั้งค่า</Link>
            <Link href="/login?next=%2Fplay">เข้าสู่ระบบ</Link>
          </div>
          <span className="landing-project-status"><i aria-hidden="true" /> mind@chao-ngo ~ $ กำลังเตรียมแฟ้ม</span>
        </nav>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-10">
          <div className="pointer-events-auto mx-auto grid max-w-6xl gap-4 border border-white/15 bg-black/90 p-4 shadow-[0_14px_40px_rgba(0,0,0,0.55)] backdrop-blur md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-5">
            <div>
              <p className="text-xs font-bold tracking-[0.12em] text-[#8fc9c5]">เจ้าเงาะ / INVESTIGATIVE SCIENCE GAME</p>
              <h1 className="mt-1 font-display text-xl leading-tight text-white sm:text-2xl">ดูหลักฐาน ตั้งข้อสงสัย เชื่อมโยงข้อมูล แล้วตัดสินใจด้วยเหตุผลของคุณ</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">AI เป็นคู่คิดเพื่อช่วยตั้งคำถาม ไม่ใช่ผู้เฉลย คุณจะเริ่มจากแฟ้มคดี เลือกหลักฐาน และบันทึกความคืบหน้าด้วยบัญชีของคุณ</p>
              <p className="landing-investigation-loop" aria-label="ลำดับการสืบสวน"><span>หลักฐาน</span><b aria-hidden="true">→</b><span>ข้อสงสัย</span><b aria-hidden="true">→</b><span>เชื่อมโยง</span><b aria-hidden="true">→</b><span>AI คู่คิด</span><b aria-hidden="true">→</b><span>ตัดสินใจ</span></p>
            </div>
            <Link
              className="flex min-h-12 items-center justify-center border border-[#ff764d]/65 bg-[#ff764d]/18 px-5 text-sm font-bold text-white outline-none transition hover:bg-[#ff764d]/30 focus-visible:ring-2 focus-visible:ring-[#ff9b7a]"
              href="/play"
            >
              เริ่มจากแฟ้มคดี
            </Link>
          </div>
        </div>
      </section>
      <section className="border-t border-white/10 bg-[#080808] px-4 py-10 sm:px-6 lg:px-10 lg:py-14" aria-label="จุดเริ่มต้นแฟ้มคดี">
        <div className="mx-auto grid max-w-6xl gap-8 border-y border-white/15 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)] lg:items-end">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-[#8fc9c5]">เจ้าเงาะ / CASE ENTRY</p>
            <h2 className="mt-3 max-w-3xl font-display text-3xl leading-tight text-white sm:text-4xl">ภาพที่เห็นเป็นเพียงจุดเริ่มต้นของการสืบ</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65">เลือกแฟ้มคดี เปิด Timeline อ่านวัตถุพยาน แล้วทดสอบคำอธิบายของคุณกับหลักฐานก่อนส่งคำตอบตามเงื่อนไขของแต่ละคดี</p>
          </div>
          <div className="grid gap-3 sm:flex sm:items-center sm:justify-end">
            <Link className="inline-flex min-h-11 items-center justify-center border border-[#ff764d]/65 bg-[#ff764d]/15 px-4 text-sm font-bold text-white transition hover:bg-[#ff764d]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ff9b7a]" href="/play">เลือกแฟ้มคดี</Link>
            <span className="text-xs text-white/50">บัญชีจำเป็นเมื่อคุณต้องการบันทึกความคืบหน้าและส่งคำตอบ</span>
          </div>
        </div>
      </section>
    </main>
  );
}
