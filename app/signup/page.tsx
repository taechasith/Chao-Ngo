import { AppShell } from "../../components/player/app-shell";
import { AuthForm } from "../../components/player/auth-form";
import { Panel } from "../../components/player/panel";
import { authDestination, googleSignInError } from "../../lib/auth-navigation";
import { getGoogleAuthConfigurationForRuntime } from "../../lib/server/auth";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return <AppShell pageTitle="เริ่มต้นด้วย Google">
    <div className="player-auth-layout">
      <header className="player-page-heading" data-player-reveal="heading"><span className="player-eyebrow">BEFORE THE CASE</span><h1>เริ่มการสืบสวน</h1><p>ใช้บัญชี Google เพื่อเก็บแฟ้มคดีและความคืบหน้าของคุณ</p><p className="player-auth-note">การสร้างบัญชีไม่ใช่การยินยอมเข้าร่วมการวิจัย คุณจะเห็นรายละเอียดและเลือกด้วยตัวเองก่อนเริ่ม</p></header>
      <div data-player-reveal="primary"><Panel><AuthForm mode="signup" redirectTo={authDestination(params.next)} available={Boolean(getGoogleAuthConfigurationForRuntime())} initialError={googleSignInError(params.error)} /></Panel></div>
    </div>
  </AppShell>;
}
