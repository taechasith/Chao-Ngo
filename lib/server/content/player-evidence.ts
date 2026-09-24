import { env } from "cloudflare:workers";

export type PlayerEvidence = {
  id: string;
  title: string;
  kind: "image" | "pdf" | "audio" | "video" | "text" | "other";
  url: string | null;
};

export type PlayerTimelineNode = {
  id: string;
  slug: string;
  title: string;
  files: PlayerEvidence[];
};

export type PlayerTimelineOptions = {
  gameSlug?: string;
  r2KeyPrefix?: string;
};

export const defaultPlayerAssistantUrl = "https://gemini.google.com/gem/45cb7e3f0314";

/** Keep admin-authored assistant links external, HTTPS-only, and free of credentials. */
export function safePlayerAssistantUrl(value: string | null | undefined): string {
  if (!value) return defaultPlayerAssistantUrl;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return defaultPlayerAssistantUrl;
    return url.href;
  } catch {
    return defaultPlayerAssistantUrl;
  }
}

/** The admin-published games row is the source of truth for the assistant target. */
export async function getPlayerAssistantUrl(gameSlug: string): Promise<string> {
  if (!gameSlugPattern.test(gameSlug)) return defaultPlayerAssistantUrl;
  try {
    const game = await env.DB.prepare("SELECT assistant_url FROM games WHERE slug = ? LIMIT 1")
      .bind(gameSlug)
      .first<{ assistant_url: string | null }>();
    return safePlayerAssistantUrl(game?.assistant_url);
  } catch {
    return defaultPlayerAssistantUrl;
  }
}

/** The player never decides publication locally; D1 remains the authority. */
export async function isPlayerGamePlayable(gameSlug: string): Promise<boolean> {
  if (!gameSlugPattern.test(gameSlug)) return false;
  try {
    const game = await env.DB.prepare("SELECT status FROM games WHERE slug = ? LIMIT 1")
      .bind(gameSlug)
      .first<{ status: string }>();
    return game?.status === "playable";
  } catch {
    return false;
  }
}

type EvidenceRow = {
  node_id: string;
  slug: string;
  node_title: string;
  asset_id: string | null;
  asset_title: string | null;
  kind: PlayerEvidence["kind"] | null;
  public_url: string | null;
  r2_key: string | null;
};

const localCaseImages: Record<string, Record<string, string>> = {
  "pre-case": { "AIenhanceCCTV_Zoom.png": "/node-zone-hero/pre-case/AIenhanceCCTV_Zoom.png" },
  quantum: { "AIenhance_CCTV.png": "/node-zone-hero/quantum/AIenhance_CCTV.png" },
  space: { "AIenhance_CCTV.png": "/node-zone-hero/space/AIenhance_CCTV.png" },
};

const gameSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const r2KeyPrefixPattern = /^games\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*\/$/;

function timelineOptions(input: PlayerTimelineOptions): { gameSlug: string; r2KeyPrefix: string } | null {
  const gameSlug = input.gameSlug ?? "node-zone";
  const r2KeyPrefix = input.r2KeyPrefix ?? `games/${gameSlug}/`;

  if (
    !gameSlugPattern.test(gameSlug) ||
    !r2KeyPrefixPattern.test(r2KeyPrefix) ||
    !r2KeyPrefix.startsWith(`games/${gameSlug}/`)
  ) {
    return null;
  }

  return { gameSlug, r2KeyPrefix };
}

function isHtmlAssetKey(value: string | null): boolean {
  const pathname = value?.split(/[?#]/, 1)[0];
  return Boolean(pathname && /\.html?$/i.test(pathname));
}

function publicAssetUrl(value: string | null, r2KeyPrefix: string, r2Key: string | null): string | null {
  if (!value || !r2Key || isHtmlAssetKey(r2Key)) return null;

  try {
    const url = new URL(value);
    const expectedPath = `/${r2Key}`;
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === expectedPath &&
      url.pathname.startsWith(`/${r2KeyPrefix}`) &&
      !isHtmlAssetKey(url.pathname)
      ? url.href
      : null;
  } catch { return null; }
}

export async function getPlayerTimeline(input: PlayerTimelineOptions = {}): Promise<PlayerTimelineNode[] | null> {
  const options = timelineOptions(input);
  if (!options) return null;

  try {
    const result = await env.DB.prepare(`
      SELECT t.id AS node_id, t.slug, t.title AS node_title,
             a.id AS asset_id, a.title AS asset_title, a.kind, a.public_url, a.r2_key
        FROM timeline_nodes t
        JOIN games g ON g.id = t.game_id AND g.status = 'playable'
        LEFT JOIN subgames s ON s.timeline_node_id = t.id
        LEFT JOIN assets a ON a.timeline_node_id = t.id AND a.player_visible = 1
          AND a.r2_key LIKE ?
       WHERE g.slug = ? AND t.published = 1
          AND (s.id IS NULL OR s.status = 'playable')
        ORDER BY t.sort_order, a.sort_order, a.id
    `).bind(`${options.r2KeyPrefix}%`, options.gameSlug).all<EvidenceRow>();
    const nodes = new Map<string, PlayerTimelineNode>();
    for (const row of result.results) {
      let node = nodes.get(row.node_id);
      if (!node) {
        node = { id: row.node_id, slug: row.slug, title: row.node_title, files: [] };
        nodes.set(row.node_id, node);
      }
      if (row.asset_id && row.asset_title && row.kind && !isHtmlAssetKey(row.r2_key)) {
        node.files.push({
          id: row.asset_id,
          title: row.asset_title,
          kind: row.kind,
          url: options.gameSlug === "node-zone"
            ? localCaseImages[row.slug]?.[row.asset_title] ?? publicAssetUrl(row.public_url, options.r2KeyPrefix, row.r2_key)
            : publicAssetUrl(row.public_url, options.r2KeyPrefix, row.r2_key),
        });
      }
    }
    return [...nodes.values()];
  } catch {
    return null;
  }
}
