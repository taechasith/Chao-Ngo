const avatarPath = "/api/player-profile/avatar?v=";
const versionPattern = /^[a-f0-9-]{36}$/;

export function avatarUrl(version: string) { return `${avatarPath}${version}`; }

export function avatarKey(userId: string, url: string | null | undefined): string | null {
  if (!url?.startsWith(avatarPath)) return null;
  const version = url.slice(avatarPath.length);
  return versionPattern.test(version) ? `player-avatars/${encodeURIComponent(userId)}/${version}` : null;
}
