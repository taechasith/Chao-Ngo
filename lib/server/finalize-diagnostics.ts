import { isD1Overload, isRetryableD1Error } from "./d1-overload";

export function finalizeDiagnosticsEnabled(bindings: object) {
  return Reflect.get(bindings, "FINALIZE_DIAGNOSTICS") === "1";
}

export function logFinalize(trace: string, stage: string, elapsedMs: number, error?: unknown) {
  const flags = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
  const category = error === undefined ? undefined
    : flags.overloaded === true ? "durable_object_overloaded"
    : isD1Overload(error) ? "storage_overloaded"
    : isRetryableD1Error(error) ? "d1_transient"
    : flags.retryable === true ? "platform_retryable"
    : error instanceof Error && /too many (?:subrequests|api requests)/i.test(error.message) ? "subrequest_limit"
    : error instanceof Error && /on behalf of a different request/i.test(error.message) ? "cross_request_io"
    : error instanceof TypeError ? "type_error" : "unexpected";
  // Keep line/column hints, never log query text, exception messages, headers or player data.
  const frames = error instanceof Error ? error.stack?.split("\n").slice(1, 5)
    .map(line => /[\w.-]+:\d+:\d+/.exec(line)?.[0]).filter(Boolean) : undefined;
  const record = { event: "submission_finalize", trace: /^[a-f0-9-]{36}$/.test(trace) ? trace : undefined, stage, elapsedMs: Math.round(elapsedMs), category, frames };
  if (error === undefined) console.info(JSON.stringify(record));
  else console.error(JSON.stringify(record));
}
