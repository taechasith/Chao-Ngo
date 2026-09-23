"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { InvestigativeAction } from "./investigative-action";

export function PasswordResetRequestForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || status === "sending") return;
    setStatus("sending");
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        body: JSON.stringify({ email, redirectTo: `${window.location.origin}/reset-password` }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setStatus(response.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return <form className="space-y-5" onSubmit={submit}>
    <label className="grid gap-2 text-sm text-white/80">
      อีเมลบัญชี
      <input autoComplete="email" className="player-input" name="email" onChange={(event) => setEmail(event.target.value.trim().toLowerCase())} required type="email" value={email} />
    </label>
    <InvestigativeAction disabled={status === "sending"} type="submit">{status === "sending" ? "กำลังส่งลิงก์" : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}</InvestigativeAction>
    {status === "sent" ? <p aria-live="polite" className="text-sm text-cyan-100">หากอีเมลนี้มีบัญชีอยู่ ระบบจะส่งลิงก์ให้ โปรดตรวจกล่องจดหมายและ Spam</p> : null}
    {status === "error" ? <p aria-live="polite" className="text-sm text-red-200">ส่งลิงก์ไม่ได้ในขณะนี้ ลองใหม่อีกครั้งในอีกสักครู่</p> : null}
  </form>;
}

export function PasswordResetForm({ token }: { token?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) { setStatus("error"); setMessage("ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว"); return; }
    if (password.length < 12) { setStatus("error"); setMessage("รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร"); return; }
    if (password !== confirmation) { setStatus("error"); setMessage("รหัสผ่านทั้งสองช่องไม่ตรงกัน"); return; }
    setStatus("saving"); setMessage("");
    try {
      const response = await fetch("/api/auth/reset-password", {
        body: JSON.stringify({ newPassword: password, token }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) { setStatus("error"); setMessage("ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว"); return; }
      router.replace("/login?reset=success");
    } catch {
      setStatus("error"); setMessage("ตั้งรหัสผ่านใหม่ไม่ได้ในขณะนี้");
    }
  }

  if (!token) return <p className="text-sm text-red-200">ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว <Link className="underline" href="/forgot-password">ขอลิงก์ใหม่</Link></p>;

  return <form className="space-y-5" onSubmit={submit}>
    <label className="grid gap-2 text-sm text-white/80">รหัสผ่านใหม่<input autoComplete="new-password" className="player-input" minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
    <label className="grid gap-2 text-sm text-white/80">ยืนยันรหัสผ่านใหม่<input autoComplete="new-password" className="player-input" minLength={12} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} /></label>
    <InvestigativeAction disabled={status === "saving"} type="submit">{status === "saving" ? "กำลังบันทึก" : "บันทึกรหัสผ่านใหม่"}</InvestigativeAction>
    {message ? <p aria-live="polite" className="text-sm text-red-200">{message}</p> : null}
  </form>;
}
