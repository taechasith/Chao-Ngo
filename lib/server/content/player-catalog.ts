import { env } from "cloudflare:workers";

export type PlayerCase = { id: string; slug: string; title: string; status: "coming_soon" | "playable" };
export type PlayerGame = PlayerCase & { cases: PlayerCase[] };

export async function getPlayerCatalog(): Promise<PlayerGame[] | null> {
  try {
    const [games, cases] = await env.DB.batch([
      env.DB.prepare("SELECT id, slug, title, status FROM games WHERE status != 'hidden' ORDER BY sort_order"),
      env.DB.prepare("SELECT id, game_id, slug, title, status FROM subgames WHERE status != 'hidden' ORDER BY created_at, id"),
    ]);
    return (games.results as PlayerCase[]).map(game => ({ ...game, cases: (cases.results as (PlayerCase & { game_id: string })[]).filter(item => item.game_id === game.id) }));
  } catch { return null; }
}

export async function getCasePublication(id: string): Promise<"playable" | "unavailable" | "closed"> {
  try {
    const row = await env.DB.prepare("SELECT s.status, g.status AS game_status FROM subgames s JOIN games g ON g.id = s.game_id WHERE s.id = ?").bind(id).first<{ status: string; game_status: string }>();
    return row?.status === "playable" && row.game_status === "playable" ? "playable" : "closed";
  } catch { return "unavailable"; }
}
