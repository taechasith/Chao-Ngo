import { env } from "cloudflare:workers";

import { approvedResearchConsentText } from "./research-consent-copy";
import { researchCollectionPolicy } from "./research-policy";
import { researchRetentionYearsFromValue } from "./research-retention";

let inFlight: { database: D1Database; result: Promise<ReturnType<typeof policyFromSettings>> } | undefined;
function policyFromSettings(settings: Map<string, string>, privateStorageReady: boolean) {
  return {
    ...researchCollectionPolicy,
    enabled: settings.get("research_collection_enabled") === "true",
    privateStorageReady,
    retentionAndWithdrawalPolicy: approvedResearchConsentText(researchRetentionYearsFromValue(settings.get("research_retention_years"))),
  };
}

/** Coalesce simultaneous public configuration reads; never cache consent or participant data. */
export async function getResearchCollectionPolicy() {
  const database = env.DB;
  if (inFlight?.database === database) return inFlight.result;
  const result = readPolicy();
  inFlight = { database, result };
  try { return await result; }
  finally { if (inFlight?.result === result) inFlight = undefined; }
}

async function readPolicy() {
  const rows = await env.DB.prepare("SELECT key, value FROM app_metadata WHERE key IN ('research_collection_enabled', 'research_retention_years')")
    .all<{ key: string; value: string }>();
  const settings = new Map(rows.results.map(row => [row.key, row.value]));
  return policyFromSettings(settings, Boolean(env.PRIVATE_UPLOADS));
}
