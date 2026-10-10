export const caseRoutes: Record<string, string> = {
  'subgame-node-zone-quantum': '/play/node-zone/quantum',
  'subgame-node-zone-space': '/play/node-zone/space',
  'subgame-ka-fintech': '/play/ka-casefiles/maimee',
  'subgame-ka-wa-ve': '/play/ka-casefiles/wa-ve',
};
export function pretestCaseForPath(path: string): string | null {
  if (path.includes('/quantum')) return 'subgame-node-zone-quantum';
  if (path.includes('/space')) return 'subgame-node-zone-space';
  if (/ka-casefiles\/(maimee|fintech)$/.test(path)) return 'subgame-ka-fintech';
  if (/ka-casefiles\/(wa-ve|psychology|biotech|human-biotech)$/.test(path)) return 'subgame-ka-wa-ve';
  return null;
}
export function scaleDescription(options: unknown): string {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return '';
  const labels = (options as { labels?: Record<string, unknown> }).labels;
  return labels ? Object.values(labels).filter((label): label is string => typeof label === 'string').join(' · ') : '';
}
