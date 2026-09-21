import Link from "next/link";

import { AppShell } from "../../components/player/app-shell";
import { AuthForm } from "../../components/player/auth-form";
import { Panel } from "../../components/player/panel";

export default function LoginPage() {
  return (
    <AppShell pageTitle="เข้าสู่ระบบ">
      <div className="player-auth-layout">
        <header className="player-page-heading" data-player-reveal="heading">
          <span className="player-eyebrow">RETURN TO THE CASE</span>
          <h1>เข้าสู่ระบบ</h1>
          <p>กลับไปยังความคืบหน้าและแฟ้มคดีของคุณ</p>
          <p className="player-auth-note">บัญชีช่วยให้คุณเก็บสิ่งที่เคยสำรวจไว้และกลับมาคิดต่อจากจุดเดิม</p>
        </header>
        <div data-player-reveal="primary">
          <Panel>
            <AuthForm mode="login" />
          </Panel>
          <p className="mt-5 text-sm text-white/70">
            ยังไม่มีบัญชี?{" "}
            <Link className="text-[#bfe6e2] underline decoration-white/30 underline-offset-4" href="/signup">สร้างบัญชี</Link>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
