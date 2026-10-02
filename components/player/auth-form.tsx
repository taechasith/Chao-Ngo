"use client";

import { useState } from "react";
import Link from "next/link";
import { TurnstileWidget } from "./turnstile-widget";
import { authDestination } from "../../lib/auth-navigation";

type AuthFormProps = { mode: "login" | "signup"; redirectTo?: string; available: boolean; initialError?: string };

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.91 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;
}

export function AuthForm({ mode, redirectTo, available, initialError }: AuthFormProps) {
  const [message, setMessage] = useState(initialError ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const next = authDestination(redirectTo);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || isSubmitting) return;
    if (siteKey && !turnstileToken) { setMessage("โปรดยืนยันการตรวจสอบความปลอดภัยก่อนเข้าสู่ระบบ"); return; }
    setIsSubmitting(true); setMessage("");
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        body: JSON.stringify({ provider: "google", callbackURL: next, newUserCallbackURL: "/onboarding", errorCallbackURL: `/login?next=${encodeURIComponent(next)}`, disableRedirect: true, turnstileToken }),
        credentials: "same-origin", headers: { "Content-Type": "application/json" }, method: "POST",
      });
      const body = await response.json().catch(() => null) as { url?: string; code?: string } | null;
      if (!response.ok || !body?.url) throw new Error(response.status === 429 ? "ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่" : response.status === 403 ? "การตรวจสอบความปลอดภัยไม่ผ่าน กรุณาลองอีกครั้ง" : response.status === 503 ? "เข้าสู่ระบบด้วย Google ยังไม่พร้อมใช้งานในขณะนี้" : "เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองอีกครั้ง");
      const destination = new URL(body.url);
      if (destination.origin !== "https://accounts.google.com") throw new Error("ไม่สามารถเปิดหน้าเข้าสู่ระบบ Google ได้");
      window.location.assign(destination.href);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อกับระบบได้");
      setIsSubmitting(false); setTurnstileToken(null); setTurnstileResetKey(value => value + 1);
    }
  }

  return <form className="player-google-auth" onSubmit={submit}>
    <div className="player-google-auth-heading"><span className="player-eyebrow">YOUR GOOGLE ACCOUNT</span><h2>{mode === "signup" ? "เริ่มต้นด้วย Google" : "กลับมาสืบต่อ"}</h2><p>เลือกบัญชี Google เพื่อเข้าสู่พื้นที่ของคุณ</p></div>
    {available ? <TurnstileWidget action="login" key={turnstileResetKey} onTokenChange={setTurnstileToken} siteKey={siteKey} /> : <p className="player-google-auth-status" role="status">เข้าสู่ระบบด้วย Google ยังไม่พร้อมใช้งาน กรุณาลองอีกครั้งภายหลัง</p>}
    <button className="player-google-button" disabled={!available || isSubmitting} type="submit"><GoogleMark /><span>{isSubmitting ? "กำลังไปยัง Google…" : "ดำเนินการต่อด้วย Google"}</span></button>
    {message ? <p className="player-google-auth-error" role="alert">{message}</p> : null}
    <p className="player-google-auth-privacy">ใช้ชื่อ รูปโปรไฟล์ และอีเมลจาก Google เพื่อสร้างบัญชีและเก็บความคืบหน้า · <Link href="/privacy">อ่านนโยบายความเป็นส่วนตัว</Link></p>
    <p className="player-auth-note">หากเคยมีบัญชีแล้ว ให้เลือก Google ที่ใช้อีเมลเดียวกับบัญชีเดิม</p>
  </form>;
}
