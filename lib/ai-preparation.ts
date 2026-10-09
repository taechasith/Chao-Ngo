export type AiPreparation = { aiCompanionUsed: boolean; additionalAiLinks: string[] };
export const maxAdditionalAiLinks = 5;
export function parseAdditionalAiLinks(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > maxAdditionalAiLinks) return null;
  const links: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > 2000) return null;
    try {
      const url = new URL(item.trim());
      if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") ||
          url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
          /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || /\s/u.test(item.trim()) || [...item.trim()].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
      links.push(url.href);
    } catch { return null; }
  }
  return [...new Set(links)];
}
export function storedAdditionalAiLinks(json: string | null | undefined): string[] {
  try { return parseAdditionalAiLinks(JSON.parse(json ?? "[]")) ?? []; } catch { return []; }
}
