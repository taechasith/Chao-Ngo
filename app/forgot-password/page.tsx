import Link from "next/link";

import { AppShell } from "../../components/player/app-shell";
import { Panel } from "../../components/player/panel";
import { PasswordResetRequestForm } from "../../components/player/password-reset-forms";

export default function ForgotPasswordPage() {
  return <AppShell pageTitle="ตั้งรหัสผ่านใหม่"><div className="player-auth-layout"><header className="player-page-heading" data-player-reveal="heading"><span className="player-eyebrow">ACCOUNT RECOVERY</span><h1>ตั้งรหัสผ่านใหม่</h1><p>กรอกอีเมลของบัญชี แล้วเราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้คุณ</p></header><div data-player-reveal="primary"><Panel><PasswordResetRequestForm /></Panel><p className="mt-5 text-sm text-white/70"><Link className="text-[#bfe6e2] underline decoration-white/30 underline-offset-4" href="/login">กลับไปเข้าสู่ระบบ</Link></p></div></div></AppShell>;
}
