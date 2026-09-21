import { env } from "cloudflare:workers";

export const DEFAULT_RESEARCH_RETENTION_YEARS = 3;
export const RESEARCH_RETENTION_CONFIG_KEY = "research_retention_years";

export async function getResearchRetentionYears(): Promise<number> {
  const row = await env.DB.prepare("SELECT value FROM app_metadata WHERE key = ?")
    .bind(RESEARCH_RETENTION_CONFIG_KEY)
    .first<{ value: string }>();
  const configured = Number(row?.value);

  return Number.isInteger(configured) && configured >= 1 && configured <= 20
    ? configured
    : DEFAULT_RESEARCH_RETENTION_YEARS;
}
