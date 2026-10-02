// Keep provider response text out of logs: it may echo addresses, keys or auth URLs.
const resendErrorNames = new Set([
  "validation_error", "missing_api_key", "invalid_api_key", "restricted_api_key",
  "invalid_permission", "suspended_api_key", "daily_quota_exceeded",
  "monthly_quota_exceeded", "rate_limit_exceeded", "application_error",
  "service_unavailable", "invalid_parameter", "missing_required_field",
  "missing_required_parameter",
]);

export type EmailDeliveryFailure = {
  event: "transactional_email_delivery_failed";
  status: number | null;
  resendError: string | null;
  reason: string;
};

export function describeResendFailure(status: number, body: unknown): EmailDeliveryFailure {
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const name = typeof payload.name === "string" && resendErrorNames.has(payload.name) ? payload.name : "unknown";
  const message = typeof payload.message === "string" ? payload.message.toLowerCase() : "";
  let reason = "provider_rejected";

  if (message.includes("only send testing emails")) reason = "testing_recipient_restriction";
  else if (/domain.*not verified/.test(message)) reason = "sender_domain_not_verified";
  else if (/domain.*(not allowed|not authorized)|domain.*does not match/.test(message)) reason = "sender_domain_not_allowed";
  else if (name === "suspended_api_key") reason = "api_key_suspended";
  else if (name === "restricted_api_key" || name === "invalid_permission") reason = "api_key_restricted";
  else if (status === 401 || name === "invalid_api_key" || /api key.*invalid/.test(message)) reason = "invalid_api_key";
  else if (name === "daily_quota_exceeded" || name === "monthly_quota_exceeded") reason = "sending_quota_exceeded";
  else if (status === 429) reason = "rate_limited";
  else if (status >= 500) reason = "provider_unavailable";
  else if (status === 400 || status === 422) reason = "invalid_payload";

  return { event: "transactional_email_delivery_failed", status, resendError: name, reason };
}

export function failEmailDelivery(failure: EmailDeliveryFailure): never {
  console.error(JSON.stringify(failure));
  throw new Error(`Transactional email delivery failed: ${failure.status ?? "no-response"} / ${failure.resendError ?? "local"} / ${failure.reason}.`);
}
