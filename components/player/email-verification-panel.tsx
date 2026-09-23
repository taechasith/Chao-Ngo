"use client";

import { useState } from "react";

import { InvestigativeAction } from "./investigative-action";

type Status = "idle" | "sending" | "sent" | "error";

export function EmailVerificationPanel({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function resend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || status === "sending") return;
    setStatus("sending");

    try {
      const response = await fetch("/api/auth/send-verification-email", {
        body: JSON.stringify({ email, callbackURL: next }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setStatus(response.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return <form className="space-y-5" onSubmit={resend}>
    <label className="grid gap-2 text-sm text-white/80">
      อีเมลที่ใช้สร้างบัญชี
      <input autoComplete="email" className="player-input" name="email" onChange={(event) => setEmail(event.target.value.trim().toLowerCase())} required type="email" value={email} />
    </label>
    <InvestigativeAction disabled={status === "sending"} type="submit">
      {status === "sending" ? "กำลังส่งลิงก์" : "ส่งลิงก์ยืนยันอีกครั้ง"}
    </InvestigativeAction>
    {status === "sent" ? <p aria-live="polite" className="text-sm text-cyan-100">หากบัญชีนี้รอยืนยันอยู่ ระบบได้ส่งลิงก์ใหม่แล้ว โปรดตรวจกล่องจดหมายและ Spam</p> : null}
    {status === "error" ? <p aria-live="polite" className="text-sm text-red-200">ส่งลิงก์ไม่ได้ในขณะนี้ ลองใหม่อีกครั้งในอีกสักครู่</p> : null}
  </form>;
}
