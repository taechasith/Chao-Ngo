/** Only allow local destinations, including query strings and case anchors. */
export function isLocalAuthDestination(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false;
  try {
    const url = new URL(value, "https://player.invalid");
    return url.origin === "https://player.invalid";
  } catch { return false; }
}

export function authDestination(value?: string): string {
  if (!isLocalAuthDestination(value)) return "/onboarding";
  const url = new URL(value, "https://player.invalid");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function googleSignInError(code?: string): string | undefined {
  if (!code) return undefined;
  if (code === "access_denied") return "ยกเลิกการเข้าสู่ระบบแล้ว คุณเลือกบัญชี Google ใหม่ได้เมื่อพร้อม";
  if (["state_mismatch", "state_not_found", "state_expired", "invalid_code"].includes(code)) return "ลิงก์เข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง กรุณาเริ่มเข้าสู่ระบบอีกครั้ง";
  if (code === "google_email_not_verified") return "กรุณาใช้บัญชี Google ที่ยืนยันอีเมลแล้ว";
  return "เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองอีกครั้ง";
}
