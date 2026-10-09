import playerContent from "./content/ka-v2-player-assets.json";

export type KaEvidenceKind = "audio" | "image" | "other" | "pdf" | "text" | "video";

export type KaEvidence = {
  id: string;
  kind: KaEvidenceKind;
  title: string;
  url: string;
};

export type KaTimelineNode = {
  files: KaEvidence[];
  id: string;
  slug: string;
  title: string;
};

export const kaGame = {
  id: "game-ka-casefiles",
  slug: "ka-casefiles",
  title: "THE K.A. CASEFILES",
} as const;

export const kaSubgames = {
  maimee: {
    academicField: "FinTech",
    id: "subgame-ka-fintech",
    route: "/play/ka-casefiles/maimee",
    slug: "maimee",
    subtitle: "FinTech",
    title: "คดี MAIMEE",
  },
  "wa-ve": {
    academicField: "Bio",
    id: "subgame-ka-wa-ve",
    route: "/play/ka-casefiles/wa-ve",
    slug: "wa-ve",
    subtitle: "Bio",
    title: "คดี WA VE",
  },
} as const;

export type KaSubgameSlug = keyof typeof kaSubgames;

export const kaLegacySubgameAliases: Record<string, (typeof kaSubgames)["wa-ve"]["id"]> = {
  "subgame-ka-biotech": "subgame-ka-wa-ve",
  "subgame-ka-psychology": "subgame-ka-wa-ve",
};

export const kaLegacySlugAliases: Record<string, KaSubgameSlug> = {
  biotech: "wa-ve",
  fintech: "maimee",
  "human-biotech": "wa-ve",
  psychology: "wa-ve",
};

export function canonicalKaSubgameId(subgameId: string): string {
  return kaLegacySubgameAliases[subgameId] ?? subgameId;
}

export function isKaSubgameId(subgameId: string): boolean {
  return canonicalKaSubgameId(subgameId) === kaSubgames.maimee.id ||
    canonicalKaSubgameId(subgameId) === kaSubgames["wa-ve"].id;
}

export function kaRouteForSubgameId(subgameId: string): string | null {
  const canonicalId = canonicalKaSubgameId(subgameId);
  if (canonicalId === kaSubgames.maimee.id) return kaSubgames.maimee.route;
  if (canonicalId === kaSubgames["wa-ve"].id) return kaSubgames["wa-ve"].route;
  return null;
}

export const kaSubmissionRequirements = {
  allowedAnswerAttachmentExtensions: [] as const,
  requiresAiChatPdf: true,
  requiresAnswerTextOrAttachment: true,
  requiresPosttest: false,
  version: "netlood-city-submission-v1",
} as const;

export const kaContentVersion = playerContent.version;

function evidenceFor(scope: string): KaEvidence[] {
  return playerContent.assets.filter(asset => asset.scope === scope)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(asset => ({ id: asset.id, kind: asset.kind as KaEvidenceKind, title: asset.title, url: asset.localUrl }));
}

const netloodCityFiles: KaEvidence[] = [
  { id: "asset-ka-netlood-brief", kind: "pdf", title: "NetLood City", url: "/ka-casefiles/netlood-city/netlood-city.pdf" },
];
const personnelFiles = evidenceFor("personnel");
const maimeeFiles = evidenceFor("maimee");
const waVeFiles = evidenceFor("wa-ve");

export const kaCaseImages = {
  maimee: "/ka-casefiles/v2/maimee/scene-02.png",
  "wa-ve": "/ka-casefiles/v2/wa-ve/cctv-01.png",
} as const;

export const kaTimelineNodes: Record<"maimee" | "wa-ve", KaTimelineNode[]> = {
  maimee: [
    { files: netloodCityFiles, id: "timeline-ka-netlood-city", slug: "netlood-city", title: "NetLood City" },
    { files: personnelFiles, id: "timeline-ka-personnel", slug: "personnel", title: "บุคลากรในบริษัท" },
    { files: maimeeFiles, id: "timeline-ka-maimee", slug: "maimee", title: "คดี MAIMEE" },
  ],
  "wa-ve": [
    { files: netloodCityFiles, id: "timeline-ka-netlood-city", slug: "netlood-city", title: "NetLood City" },
    { files: personnelFiles, id: "timeline-ka-personnel", slug: "personnel", title: "บุคลากรในบริษัท" },
    { files: waVeFiles, id: "timeline-ka-wa-ve", slug: "wa-ve", title: "คดี WA VE" },
  ],
};

export const kaNodeLabels: Record<string, string> = {
  maimee: "คดี MAIMEE",
  "netlood-city": "NetLood City",
  personnel: "บุคลากรในบริษัท",
  "wa-ve": "คดี WA VE",
};

export const kaSubmissionGuide = {
  steps: [
    "บทสรุปของคดีนี้คืออะไร",
    "อะไรที่ทำให้คุณคิดเช่นนั้น",
    "ปัญหาด้าน Finance (MAIMEE) หรือ Bio (WA VE) ในคดีนี้มีอะไรบ้าง",
    "นวัตกรรมที่คุณจะสร้างคืออะไร",
    "คุณมั่นใจในคำตอบของคุณมากน้อยเพียงใด (1–5)",
    "แนบไฟล์ PDF บทสนทนากับ AI ที่ใช้ช่วยคิด",
  ],
  title: "ภารกิจหลังจบคดี",
} as const;
