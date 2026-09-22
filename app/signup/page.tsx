import Link from "next/link";

import { AppShell } from "../../components/player/app-shell";
import { AuthForm } from "../../components/player/auth-form";
import { Panel } from "../../components/player/panel";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const redirectTo = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : undefined;

  return (
    <AppShell pageTitle="สร้างบัญชี">
      <div className="player-auth-layout">
        <header className="player-page-heading" data-player-reveal="heading">
          <span className="player-eyebrow">BEFORE THE CASE</span>
          <h1>สร้างบัญชี</h1>
          <p>บัญชีช่วยให้คุณกลับมาดูแฟ้มคดีและความคืบหน้าของตัวเองได้</p>
          <p className="player-auth-note">การสร้างบัญชีไม่ใช่การยินยอมเข้าร่วมการวิจัย คุณจะเห็นรายละเอียดและเลือกด้วยตัวเองก่อนเริ่ม</p>
        </header>
        <div data-player-reveal="primary">
          <Panel>
            <AuthForm mode="signup" redirectTo={redirectTo} />
          </Panel>
          <p className="mt-5 text-sm text-white/70">
            มีบัญชีอยู่แล้ว?{" "}
            <Link className="text-[#bfe6e2] underline decoration-white/30 underline-offset-4" href={redirectTo ? `/login?next=${encodeURIComponent(redirectTo)}` : "/login"}>เข้าสู่ระบบ</Link>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
