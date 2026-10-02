import { spawn } from "node:child_process";
import console from "node:console";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";

// Never forward raw tail events: they contain request metadata and auth URLs.
const reasons = new Set([
  "testing_recipient_restriction", "sender_domain_not_verified", "sender_domain_not_allowed",
  "api_key_suspended", "api_key_restricted", "invalid_api_key", "sending_quota_exceeded",
  "rate_limited", "provider_unavailable", "invalid_payload", "provider_rejected",
  "network_error", "not_configured",
  "upstream_firewall_1010", "upstream_firewall_1020", "missing_user_agent",
]);
const errorNames = new Set([
  "validation_error", "missing_api_key", "invalid_api_key", "restricted_api_key",
  "invalid_permission", "suspended_api_key", "daily_quota_exceeded",
  "monthly_quota_exceeded", "rate_limit_exceeded", "application_error",
  "service_unavailable", "invalid_parameter", "missing_required_field",
  "missing_required_parameter", "unknown",
]);

export function sanitizeEmailFailure(value) {
  if (!value || value.event !== "transactional_email_delivery_failed" || !reasons.has(value.reason)) return null;
  return {
    event: "transactional_email_delivery_failed",
    status: Number.isInteger(value.status) && value.status >= 100 && value.status <= 599 ? value.status : null,
    resendError: errorNames.has(value.resendError) ? value.resendError : null,
    reason: value.reason,
    ...(["json", "html", "text", "empty"].includes(value.responseFormat) ? { responseFormat: value.responseFormat } : {}),
  };
}

// Wrangler prints indented JSON, potentially split across stdout chunks.
export function createEventReader(onEvent) {
  let buffer = "", depth = 0, quoted = false, escaped = false;
  return (chunk) => {
    for (const character of chunk) {
      if (!depth && character !== "{") continue;
      buffer += character;
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "{") depth++;
      else if (character === "}") depth--;
      if (buffer.length > 1_000_000) throw new Error("Tail event exceeded diagnostic limit");
      if (!depth) {
        try { onEvent(JSON.parse(buffer)); } catch { /* Ignore non-JSON CLI output. */ }
        buffer = "";
      }
    }
  };
}

function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error("Cloudflare token is not configured");
  const tail = spawn(process.execPath, [
    "node_modules/wrangler/bin/wrangler.js", "tail", "chao-ngo-player",
    "--format", "json", "--search", "transactional_email_delivery_failed", "--method", "POST",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let found = false;
  let stopping = false;
  let forceStop;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    tail.kill("SIGINT");
    forceStop = setTimeout(() => tail.kill("SIGKILL"), 10_000);
  };
  const timer = setTimeout(stop, 180_000);
  const read = createEventReader((event) => {
    for (const log of event.logs ?? []) {
      for (const message of log.message ?? []) {
        if (typeof message !== "string") continue;
        let parsed;
        try { parsed = JSON.parse(message); } catch { continue; }
        const safe = sanitizeEmailFailure(parsed);
        if (safe) {
          console.log(JSON.stringify(safe));
          found = true;
          stop();
        }
      }
    }
  });
  tail.stdout.setEncoding("utf8").on("data", (chunk) => {
    try { read(chunk); } catch { console.error("Diagnostic stream parsing failed"); stop(); }
  });
  // Discard CLI errors because their details can include request data or credentials.
  tail.stderr.resume();
  tail.on("error", () => { console.error("Unable to start Worker diagnostic stream"); stop(); });
  tail.on("close", (code) => {
    clearTimeout(timer);
    clearTimeout(forceStop);
    if (!found) {
      console.error(stopping ? "No email failure captured during the diagnostic window" : "Worker diagnostic stream could not connect; check token access to Workers tail");
      process.exitCode = code || 1;
    }
  });
  console.log("Worker email diagnostics started; trigger one verification resend within three minutes.");
}

if (process.argv[1]?.endsWith("tail-email-diagnostics.mjs")) main();
