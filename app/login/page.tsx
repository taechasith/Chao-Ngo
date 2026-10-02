import { AppShell } from "../../components/player/app-shell";
import { AuthForm } from "../../components/player/auth-form";
import { Panel } from "../../components/player/panel";
import { authDestination, googleSignInError } from "../../lib/auth-navigation";
import { getGoogleAuthConfigurationForRuntime } from "../../lib/server/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return <AppShell pageTitle="เข้าสู่ระบบ">
    <div className="player-auth-layout">
      <header className="player-page-heading" data-player-reveal="heading"><span className="player-eyebrow">RETURN TO THE CASE</span><h1>เข้าสู่ระบบ</h1><p>กลับไปยังความคืบหน้าและแฟ้มคดีของคุณ</p><p className="player-auth-note">เลือกบัญชี Google แล้วกลับมาสืบต่อจากจุดเดิม</p></header>
      <div data-player-reveal="primary"><Panel><AuthForm mode="login" redirectTo={authDestination(params.next)} available={Boolean(getGoogleAuthConfigurationForRuntime())} initialError={googleSignInError(params.error)} /></Panel><p className="player-auth-note">ผู้เล่นใหม่สร้างบัญชีได้ด้วยปุ่มเดียวกัน การเข้าสู่ระบบยังไม่ใช่การยินยอมเข้าร่วมการวิจัย</p></div>
    </div>
  </AppShell>;
}
