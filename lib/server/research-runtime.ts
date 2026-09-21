import { env } from "cloudflare:workers";

import { approvedResearchConsentText } from "./research-consent-copy";
import { researchCollectionPolicy } from "./research-policy";
import { getResearchRetentionYears } from "./research-retention";

export async function getResearchCollectionPolicy() {
  const flag = await env.DB.prepare("SELECT value FROM app_metadata WHERE key = 'research_collection_enabled'")
    .first<{ value: string }>();
  return {
    ...researchCollectionPolicy,
    enabled: flag?.value === "true",
    privateStorageReady: Boolean(env.PRIVATE_UPLOADS),
    retentionAndWithdrawalPolicy: approvedResearchConsentText(await getResearchRetentionYears()),
  };
}
