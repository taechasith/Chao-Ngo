import Link from "next/link";

import { AppShell } from "../../components/player/app-shell";
import { EmailVerificationPanel } from "../../components/player/email-verification-panel";
import { Panel } from "../../components/player/panel";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/onboarding";

  return <AppShell pageTitle="ยืนยันอีเมล">
    <div className="player-auth-layout">
      <header className="player-page-heading" data-player-reveal="heading"><span className="player-eyebrow">ACCOUNT VERIFICATION</span><h1>ตรวจกล่องจดหมายของคุณ</h1><p>เราได้ส่งลิงก์ยืนยันอีเมลแล้ว กดลิงก์นั้นเพื่อเปิดใช้งานบัญชีและเข้าสู่ระบบอัตโนมัติ</p><p className="player-auth-note">ไม่พบอีเมลหรือ? ตรวจ Spam ก่อน แล้วขอลิงก์ใหม่ได้จากด้านขวา</p></header>
      <div data-player-reveal="primary"><Panel><EmailVerificationPanel next={next} /></Panel><p className="mt-5 text-sm text-white/70"><Link className="text-[#bfe6e2] underline decoration-white/30 underline-offset-4" href="/login">กลับไปเข้าสู่ระบบ</Link></p></div>
    </div>
  </AppShell>;
}
