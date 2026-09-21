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

type EvidenceRow = {
  node_id: string;
  slug: string;
  node_title: string;
  asset_id: string | null;
  asset_title: string | null;
  kind: PlayerEvidence["kind"] | null;
  public_url: string | null;
};

const localCaseImages: Record<string, Record<string, string>> = {
  "pre-case": { "AIenhanceCCTV_Zoom.png": "/node-zone-hero/pre-case/AIenhanceCCTV_Zoom.png" },
  quantum: { "AIenhance_CCTV.png": "/node-zone-hero/quantum/AIenhance_CCTV.png" },
  space: { "AIenhance_CCTV.png": "/node-zone-hero/space/AIenhance_CCTV.png" },
};

function publicAssetUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname.startsWith("/games/node-zone/") ? url.href : null;
  } catch { return null; }
}

export async function getPlayerTimeline(): Promise<PlayerTimelineNode[] | null> {
  try {
    const result = await env.DB.prepare(`
      SELECT t.id AS node_id, t.slug, t.title AS node_title,
             a.id AS asset_id, a.title AS asset_title, a.kind, a.public_url
        FROM timeline_nodes t
        JOIN games g ON g.id = t.game_id AND g.status = 'playable'
        LEFT JOIN subgames s ON s.timeline_node_id = t.id
        LEFT JOIN assets a ON a.timeline_node_id = t.id AND a.player_visible = 1
          AND a.r2_key LIKE 'games/node-zone/%'
       WHERE g.slug = 'node-zone' AND t.published = 1
         AND (s.id IS NULL OR s.status = 'playable')
       ORDER BY t.sort_order, a.sort_order, a.id
    `).all<EvidenceRow>();
    const nodes = new Map<string, PlayerTimelineNode>();
    for (const row of result.results) {
      let node = nodes.get(row.node_id);
      if (!node) {
        node = { id: row.node_id, slug: row.slug, title: row.node_title, files: [] };
        nodes.set(row.node_id, node);
      }
      if (row.asset_id && row.asset_title && row.kind) {
        node.files.push({
          id: row.asset_id,
          title: row.asset_title,
          kind: row.kind,
          url: localCaseImages[row.slug]?.[row.asset_title] ?? publicAssetUrl(row.public_url),
        });
      }
    }
    return [...nodes.values()];
  } catch {
    return null;
  }
}
