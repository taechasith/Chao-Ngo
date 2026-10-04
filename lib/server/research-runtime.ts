import { env } from "cloudflare:workers";

import { approvedResearchConsentText } from "./research-consent-copy";
import { researchCollectionPolicy } from "./research-policy";
import { researchRetentionYearsFromValue } from "./research-retention";

export async function getResearchCollectionPolicy() {
  const rows = await env.DB.prepare("SELECT key, value FROM app_metadata WHERE key IN ('research_collection_enabled', 'research_retention_years')")
    .all<{ key: string; value: string }>();
  const settings = new Map(rows.results.map(row => [row.key, row.value]));
  return {
    ...researchCollectionPolicy,
    enabled: settings.get("research_collection_enabled") === "true",
    privateStorageReady: Boolean(env.PRIVATE_UPLOADS),
    retentionAndWithdrawalPolicy: approvedResearchConsentText(researchRetentionYearsFromValue(settings.get("research_retention_years"))),
  };
}
