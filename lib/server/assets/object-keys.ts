const PUBLIC_ASSET_PREFIXES = [
  "game/ui/",
  "game/images/",
  "game/audio/",
  "game/shared/",
  "games/node-zone/pre-case/",
  "games/node-zone/quantum/",
  "games/node-zone/space/",
  "games/node-zone/post-case/",
] as const;

export function assertPublicAssetKey(value: string): string {
  const key = value.trim();

  if (!key || key.startsWith("/") || key.includes("\\") || key.includes("..")) {
    throw new Error("The R2 object key must be a safe relative path.");
  }

  if (!PUBLIC_ASSET_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    throw new Error("The R2 object key must use an approved public asset prefix.");
  }

  return key;
}
