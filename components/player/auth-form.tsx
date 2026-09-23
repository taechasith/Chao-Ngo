"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { InvestigativeAction } from "./investigative-action";
import { TurnstileWidget } from "./turnstile-widget";

type AuthFormProps = {
  mode: "login" | "signup";
  redirectTo?: string;
};

type FormStatus =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

function messageForFailure(status: number): string {
  if (status === 403) {
    return "โปรดยืนยันการตรวจสอบความปลอดภัยแล้วลองอีกครั้ง";
  }

  if (status === 503) {
    return "การตรวจสอบความปลอดภัยไม่พร้อมใช้งานในขณะนี้";
  }

  if (status === 429) {
    return "ลองใหม่อีกครั้งในภายหลัง";
  }

  return "ไม่สามารถดำเนินการได้ในขณะนี้";
}

export function AuthForm({ mode, redirectTo }: AuthFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();

    setIsSubmitting(true);
    setStatus({ kind: "idle" });

    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

    if (turnstileSiteKey && !turnstileToken) {
      setStatus({ kind: "error", message: "โปรดยืนยันการตรวจสอบความปลอดภัยแล้วลองอีกครั้ง" });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(isSignup ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email", {
        body: JSON.stringify(isSignup ? { email, name, password, turnstileToken } : { email, password, turnstileToken }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setStatus({ kind: "error", message: messageForFailure(response.status) });
        setTurnstileToken(null);
        setTurnstileResetKey((value) => value + 1);
        return;
      }

      setStatus({
        kind: "success",
        message: isSignup
          ? "สร้างบัญชีสำเร็จ กำลังเข้าสู่แบบสอบถามก่อนเริ่มเล่น"
          : "เข้าสู่ระบบสำเร็จ",
      });

      router.replace(redirectTo ?? "/onboarding");
    } catch {
      setStatus({ kind: "error", message: "ไม่สามารถเชื่อมต่อกับระบบได้" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      {isSignup ? (
        <label className="grid gap-2 text-sm text-white/80">
          ชื่อที่ใช้แสดง
          <input
            autoComplete="name"
            className="player-input"
            maxLength={100}
            name="name"
            required
          />
        </label>
      ) : null}
      <label className="grid gap-2 text-sm text-white/80">
        อีเมล
        <input
          autoComplete="email"
          className="player-input"
          name="email"
          spellCheck={false}
          required
          type="email"
        />
      </label>
      <label className="grid gap-2 text-sm text-white/80">
        รหัสผ่าน
        <span className="player-password-field">
        <input
          autoComplete={isSignup ? "new-password" : "current-password"}
          className="player-input"
          minLength={12}
          name="password"
          required
          type={showPassword ? "text" : "password"}
        />
        <button aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)} title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} type="button">{showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}</button>
        </span>
        {isSignup ? <span className="text-xs text-white/55">อย่างน้อย 12 ตัวอักษร</span> : null}
      </label>
      <TurnstileWidget
        action={isSignup ? "signup" : "login"}
        key={turnstileResetKey}
        onTokenChange={setTurnstileToken}
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()}
      />
      {status.kind === "idle" ? null : (
        <p aria-live="polite" className={status.kind === "error" ? "text-sm text-red-200" : "text-sm text-cyan-100"}>
          {status.message}
        </p>
      )}
      <InvestigativeAction
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "กำลังดำเนินการ" : isSignup ? "สร้างบัญชี" : "เข้าสู่ระบบ"}
      </InvestigativeAction>
    </form>
  );
}
