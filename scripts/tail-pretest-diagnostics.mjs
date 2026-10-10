import { spawn } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { URL } from 'node:url';
import { createEventReader } from './tail-email-diagnostics.mjs';

export function summarizePretestEvent(event) {
  let path;
  try { path = new URL(event.event?.request?.url).pathname; } catch { return null; }
  if (!/^\/api\/questionnaires\/pretest(?::|%3A)subgame-[a-z0-9-]+\/sessions$/i.test(path)) return null;
  const status = event.event?.response?.status;
  const errors = (event.exceptions ?? []).map(item => String(item.message ?? '')).join(' ');
  const logs = (event.logs ?? []).flatMap(item => item.message ?? []).filter(item => typeof item === 'string').join(' ');
  const text = errors + ' ' + logs;
  const codes = new Set(['DATABASE_BUSY', 'UNAUTHENTICATED', 'RESEARCH_CONSENT_REQUIRED', 'RESEARCH_DATA_EXPIRED', 'QUESTIONNAIRE_NOT_FOUND', 'REQUEST_RATE_LIMITED', 'AUTH_NOT_CONFIGURED', 'RESEARCH_CONSENT_UNAVAILABLE']);
  let code;
  for (const log of event.logs ?? []) for (const message of log.message ?? []) {
    try {
      const value = JSON.parse(message);
      if (value.event === 'pretest_request_failed' && codes.has(value.code)) code = value.code;
    } catch { /* Ignore non-structured and non-allowlisted logs. */ }
  }
  const reason = /overloaded|queued for too long/i.test(text) ? 'database_busy'
    : /D1_ERROR.*Network connection lost/i.test(text) ? 'database_connection_lost'
    : /no such (table|column)/i.test(text) ? 'schema_error'
    : /LIKE or GLOB pattern too complex/i.test(text) ? 'database_pattern_limit'
    : errors ? 'unclassified_exception' : 'none';
  return { status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null, reason, ...(code ? {code} : {}) };
}

function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error('Cloudflare token is not configured');
  const totals = {};
  let count = 0;
  const tail = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js','tail','chao-ngo-player','--format','json'], {stdio:['ignore','pipe','pipe']});
  let stopping = false;
  let forceStop;
  const stop = () => {
    if (stopping) return;
    stopping = true; tail.kill('SIGINT');
    forceStop = setTimeout(() => tail.kill('SIGKILL'), 10000);
  };
  const timer = setTimeout(stop, 90000);
  const read = createEventReader(event => {
    const safe = summarizePretestEvent(event);
    if (!safe) return;
    count++;
    const key = `${safe.status ?? 'unknown'}/${safe.code ?? safe.reason}`;
    totals[key] = (totals[key] ?? 0) + 1;
  });
  tail.stdout.setEncoding('utf8').on('data', chunk => {try {read(chunk);} catch {stop();}});
  // Raw URLs, headers, user identifiers, answers and exception text are never emitted or uploaded.
  tail.stderr.resume();
  tail.on('error', stop);
  tail.on('close', code => {
    clearTimeout(timer); clearTimeout(forceStop);
    console.log(JSON.stringify({pretestRequests:count, statusCounts:totals, capturedForSeconds:90}));
    if (!stopping && code) { console.error('Worker diagnostic stream could not connect; check Workers tail permission'); process.exitCode = 1; }
  });
  console.log('Pretest diagnostics started: aggregate status and allowlisted error categories only.');
}
if (process.argv[1]?.endsWith('tail-pretest-diagnostics.mjs')) main();
