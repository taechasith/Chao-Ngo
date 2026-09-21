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
    </main>
  );
}
