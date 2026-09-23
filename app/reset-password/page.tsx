import { AppShell } from "../../components/player/app-shell";
import { Panel } from "../../components/player/panel";
import { PasswordResetForm } from "../../components/player/password-reset-forms";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AppShell pageTitle="ตั้งรหัสผ่านใหม่"><div className="player-auth-layout"><header className="player-page-heading" data-player-reveal="heading"><span className="player-eyebrow">ACCOUNT RECOVERY</span><h1>เลือกรหัสผ่านใหม่</h1><p>ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร และไม่ใช้รหัสผ่านเดิมซ้ำ</p></header><div data-player-reveal="primary"><Panel><PasswordResetForm token={token} /></Panel></div></div></AppShell>;
}
