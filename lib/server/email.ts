import { env } from "cloudflare:workers";

type EmailBindings = CloudflareEnv & {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

type TransactionalEmail = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

function configuration() {
  const bindings = env as EmailBindings;
  const apiKey = bindings.RESEND_API_KEY?.trim();
  const from = bindings.RESEND_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    throw new Error("Transactional email is not configured.");
  }

  return { apiKey, from };
}

export async function sendTransactionalEmail(message: TransactionalEmail): Promise<void> {
  const { apiKey, from } = configuration();
  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from,
      html: message.html,
      subject: message.subject,
      text: message.text,
      to: [message.to],
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Transactional email delivery failed with status ${response.status}.`);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function authEmail({ actionLabel, body, title, url }: { actionLabel: string; body: string; title: string; url: string }) {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const safeAction = escapeHtml(actionLabel);
  const safeUrl = escapeHtml(url);

  return {
    html: `<!doctype html><html lang="th"><body style="margin:0;background:#101413;color:#edf1ef;font-family:Arial,sans-serif"><main style="max-width:560px;margin:0 auto;padding:40px 24px"><p style="margin:0 0 18px;color:#9ed0c9;font-size:12px;letter-spacing:1.8px">CHAO NGO / ACCOUNT</p><h1 style="margin:0 0 18px;font-size:28px">${safeTitle}</h1><p style="margin:0 0 28px;color:#c8d0cd;line-height:1.65">${safeBody}</p><p style="margin:0 0 28px"><a href="${safeUrl}" style="display:inline-block;padding:13px 18px;background:#dd7254;color:#fff;text-decoration:none">${safeAction}</a></p><p style="margin:0;color:#8c9894;font-size:13px;line-height:1.6">หากคุณไม่ได้ดำเนินการนี้ คุณไม่ต้องทำอะไรต่อ ลิงก์นี้จะหมดอายุเพื่อความปลอดภัย</p></main></body></html>`,
    text: `${title}\n\n${body}\n\n${actionLabel}: ${url}\n\nหากคุณไม่ได้ดำเนินการนี้ คุณไม่ต้องทำอะไรต่อ`,
  };
}

export async function sendVerificationEmail({ email, url }: { email: string; url: string }): Promise<void> {
  const message = authEmail({
    actionLabel: "ยืนยันอีเมล",
    body: "กดปุ่มด้านล่างเพื่อยืนยันอีเมลและเปิดบัญชี Chao Ngo ของคุณ",
    title: "ยืนยันอีเมลของคุณ",
    url,
  });
  await sendTransactionalEmail({ ...message, subject: "ยืนยันอีเมลสำหรับ Chao Ngo", to: email });
}

export async function sendPasswordResetEmail({ email, url }: { email: string; url: string }): Promise<void> {
  const message = authEmail({
    actionLabel: "ตั้งรหัสผ่านใหม่",
    body: "มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชี Chao Ngo ของคุณ",
    title: "ตั้งรหัสผ่านใหม่",
    url,
  });
  await sendTransactionalEmail({ ...message, subject: "ตั้งรหัสผ่าน Chao Ngo ใหม่", to: email });
}
