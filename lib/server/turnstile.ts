const turnstileSiteVerifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  action?: unknown;
  hostname?: unknown;
  success?: unknown;
};

export type TurnstileVerification =
  | { configured: false; ok: true }
  | { configured: true; ok: false; reason: "invalid" | "unavailable" }
  | { configured: true; ok: true };

type VerifyTurnstileInput = {
  expectedAction?: string;
  expectedHostname?: string;
  remoteIp?: string;
  secret?: string;
  token?: string;
};

export async function verifyTurnstileToken({ expectedAction, expectedHostname, remoteIp, secret, token }: VerifyTurnstileInput): Promise<TurnstileVerification> {
  const normalizedSecret = secret?.trim();

  if (!normalizedSecret) {
    return { configured: false, ok: true };
  }

  const normalizedToken = token?.trim();

  if (!normalizedToken || normalizedToken.length > 2048) {
    return { configured: true, ok: false, reason: "invalid" };
  }

  const payload: Record<string, string> = {
    response: normalizedToken,
    secret: normalizedSecret,
  };

  if (remoteIp?.trim()) {
    payload.remoteip = remoteIp.trim();
  }

  try {
    const response = await fetch(turnstileSiteVerifyUrl, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      return { configured: true, ok: false, reason: "unavailable" };
    }

    const result = await response.json() as TurnstileResponse;
    const actionMatches = !expectedAction?.trim() || result.action === expectedAction.trim();
    const hostnameMatches = !expectedHostname?.trim() || result.hostname === expectedHostname.trim();
    return result.success === true && actionMatches && hostnameMatches
      ? { configured: true, ok: true }
      : { configured: true, ok: false, reason: "invalid" };
  } catch {
    return { configured: true, ok: false, reason: "unavailable" };
  }
}
