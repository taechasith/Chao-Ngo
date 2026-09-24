import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

function enabled(value: string | undefined) {
  return value === "true" || value === "1";
}

function safeMusicUrl(value: string | undefined) {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT key, value FROM app_metadata
      WHERE key IN ('player_music_url', 'player_music_enabled', 'player_sound_effects_enabled')`,
  ).all<{ key: string; value: string }>();
  const values = Object.fromEntries(rows.results.map((row) => [row.key, row.value]));
  const musicUrl = safeMusicUrl(values.player_music_url);

  return Response.json({
    music: {
      enabled: enabled(values.player_music_enabled) && Boolean(musicUrl),
      url: musicUrl,
    },
    soundEffects: values.player_sound_effects_enabled === undefined
      ? false
      : enabled(values.player_sound_effects_enabled),
  }, { headers: { "Cache-Control": "no-store" } });
}
