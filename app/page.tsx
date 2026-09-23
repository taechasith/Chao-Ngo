import Link from "next/link";

import { SublevelStudioLandingPage } from "../components/player/sublevel-studio-hero";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section
        aria-label="หน้าแรกแบบอินเทอร์แอกทีฟ"
        className="relative h-[100svh] min-h-[32rem] border-b border-white/10"
      >
        <SublevelStudioLandingPage />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
          <div className="mx-auto max-w-sm">
            <Link
              className="pointer-events-auto flex min-h-12 w-full items-center justify-between border border-[#ff764d]/65 bg-black/90 px-4 text-sm font-bold text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none transition hover:bg-[#ff764d]/20 focus-visible:ring-2 focus-visible:ring-[#ff9b7a]"
              href="/onboarding"
            >
              <span>เปิดแฟ้มคดี</span>
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
            <Link className="inline-flex min-h-11 items-center justify-center border border-[#ff764d]/65 bg-[#ff764d]/15 px-4 text-sm font-bold text-white transition hover:bg-[#ff764d]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ff9b7a]" href="/play">เปิดแฟ้มคดี</Link>
            <span className="text-xs text-white/50">4 คดีย่อยพร้อมสำรวจ · เงื่อนไขการส่งขึ้นกับแฟ้มคดี</span>
          </div>
        </div>
      </section>
    </main>
  );
}
