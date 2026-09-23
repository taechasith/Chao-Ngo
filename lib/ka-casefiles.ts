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
    academicField: "Bio x Psychology",
    id: "subgame-ka-wa-ve",
    route: "/play/ka-casefiles/wa-ve",
    slug: "wa-ve",
    subtitle: "Bio x Psychology",
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
  allowedAnswerAttachmentExtensions: ["txt", "docx", "pdf", "pptx", "png", "jpg", "jpeg"] as const,
  requiresAiChatPdf: false,
  requiresAnswerTextOrAttachment: true,
  requiresPosttest: false,
  version: "netlood-city-submission-v1",
} as const;

const publicRoot = "/ka-casefiles";

const netloodCityFiles: KaEvidence[] = [
  { id: "asset-ka-netlood-story", kind: "text", title: "เนื้อเรื่องก่อนเกิดเหตุ", url: `${publicRoot}/netlood-city/incident-context.txt` },
  { id: "asset-ka-netlood-brief", kind: "pdf", title: "NetLood City", url: `${publicRoot}/netlood-city/netlood-city.pdf` },
];

const personnelFiles: KaEvidence[] = [
  { id: "asset-ka-personnel-dossier", kind: "pdf", title: "แฟ้มข้อมูลบุคลากรภายในบริษัท", url: `${publicRoot}/personnel/personnel-dossier.pdf` },
  { id: "asset-ka-personnel-rafa", kind: "image", title: "Dr. Rafa Varinmetha", url: `${publicRoot}/personnel/rafa-varinmetha.png` },
  { id: "asset-ka-personnel-alexander", kind: "image", title: "Mr. Alexander Volkov", url: `${publicRoot}/personnel/alexander-volkov.png` },
  { id: "asset-ka-personnel-alisa", kind: "image", title: "Mrs. Alisa Varinmetha", url: `${publicRoot}/personnel/alisa-varinmetha.png` },
  { id: "asset-ka-personnel-chiwa", kind: "image", title: "ดร. ชีวา ภาพสันต์", url: `${publicRoot}/personnel/chiwa-phapsan.png` },
  { id: "asset-ka-personnel-surin", kind: "image", title: "ดร. สุริญา ชมภูวิเศษ", url: `${publicRoot}/personnel/surin-chomphuwiset.png` },
  { id: "asset-ka-personnel-tete", kind: "image", title: "ดร.เตเต้ เตชะเมธากุล", url: `${publicRoot}/personnel/tete-techametakun.png` },
  { id: "asset-ka-personnel-noppawan", kind: "image", title: "นาง นพวรรณ แสงจ้า", url: `${publicRoot}/personnel/noppawan-saengja.png` },
  { id: "asset-ka-personnel-lalina", kind: "image", title: "นาง ลลินา เตชะเมธากุล", url: `${publicRoot}/personnel/lalina-techametakun.png` },
  { id: "asset-ka-personnel-hathairat", kind: "image", title: "นาง หทัยรัตน์ ธำรงกิจ", url: `${publicRoot}/personnel/hathairat-thamrongkit.png` },
  { id: "asset-ka-personnel-nalinee", kind: "image", title: "นางสาว นลินี แสงจ้า", url: `${publicRoot}/personnel/nalinee-saengja.png` },
  { id: "asset-ka-personnel-max", kind: "image", title: "นาย แม็ก วงศ์วิศาล", url: `${publicRoot}/personnel/max-wongsawisan.png` },
  { id: "asset-ka-personnel-korn", kind: "image", title: "นาย กรณ์ รักษ์นิติ", url: `${publicRoot}/personnel/korn-raknit.png` },
  { id: "asset-ka-personnel-kantapong", kind: "image", title: "นาย กันตพงศ์ อภิเมธินทร์", url: `${publicRoot}/personnel/kantapong-apimet.png` },
  { id: "asset-ka-personnel-tham", kind: "image", title: "นาย ธาม ไทศิริ", url: `${publicRoot}/personnel/tham-thaisiri.png` },
  { id: "asset-ka-personnel-phisit", kind: "image", title: "นาย พิสิษฐ์ เตชานุกิจ", url: `${publicRoot}/personnel/phisit-techanuwat.png` },
  { id: "asset-ka-personnel-somboon", kind: "image", title: "นาย สมบูรณ์ ยะหะทัม", url: `${publicRoot}/personnel/somboon-yahatam.png` },
  { id: "asset-ka-personnel-atchawin", kind: "image", title: "นาย อาชวิน นาคาสิริ", url: `${publicRoot}/personnel/atchawin-nakasiri.png` },
  { id: "asset-ka-personnel-anawat", kind: "image", title: "นายแพทย์ อนวัช พรหมพิริยะ", url: `${publicRoot}/personnel/anawat-phompiriya.png` },
];

const maimeeFiles: KaEvidence[] = [
  { id: "asset-ka-maimee-case-brief", kind: "text", title: "ที่เกิดเหตุ และบันทึกการสืบสวนของคุณ", url: `${publicRoot}/maimee/case-brief.txt` },
  { id: "asset-ka-maimee-chat", kind: "pdf", title: "Secure Chat Export Report", url: `${publicRoot}/maimee/secure-chat.pdf` },
  { id: "asset-ka-maimee-timeline", kind: "pdf", title: "รายงานการสอบสวนและไทม์ไลน์การเคลื่อนไหว", url: `${publicRoot}/maimee/movement-timeline.pdf` },
  { id: "asset-ka-maimee-scene-01", kind: "image", title: "ภาพถ่ายที่เกิดเหตุ 01", url: `${publicRoot}/maimee/scene-01.png` },
  { id: "asset-ka-maimee-scene-02", kind: "image", title: "ภาพถ่ายที่เกิดเหตุ 02", url: `${publicRoot}/maimee/scene-02.png` },
  { id: "asset-ka-maimee-cctv", kind: "image", title: "CCTV 04", url: `${publicRoot}/maimee/cctv-04.png` },
  { id: "asset-ka-maimee-trophy", kind: "image", title: "ถ้วยรางวัล", url: `${publicRoot}/maimee/trophy.jpg` },
  { id: "asset-ka-maimee-ledger", kind: "text", title: "CU 07 / บันทึกภายใน AEGIS", url: `${publicRoot}/maimee/cu-07-safe.txt` },
];

const waVeFiles: KaEvidence[] = [
  { id: "asset-ka-wave-prelude", kind: "text", title: "ก่อนเสียชีวิต", url: `${publicRoot}/wa-ve/before-death.txt` },
  { id: "asset-ka-wave-case-brief", kind: "text", title: "ที่เกิดเหตุ และบันทึกการสืบสวน", url: `${publicRoot}/wa-ve/case-brief.txt` },
  { id: "asset-ka-wave-chat-01", kind: "pdf", title: "Secure Chat Export Report 01", url: `${publicRoot}/wa-ve/secure-chat-01.pdf` },
  { id: "asset-ka-wave-chat-02", kind: "pdf", title: "Secure Chat Export Report 02", url: `${publicRoot}/wa-ve/secure-chat-02.pdf` },
  { id: "asset-ka-wave-chat-03", kind: "pdf", title: "Secure Chat Export Report 03", url: `${publicRoot}/wa-ve/secure-chat-03.pdf` },
  { id: "asset-ka-wave-witness", kind: "pdf", title: "บันทึกการสอบปากคำพยานในคดี", url: `${publicRoot}/wa-ve/witness-interviews.pdf` },
  { id: "asset-ka-wave-access", kind: "pdf", title: "บันทึกการเข้าออกห้องพยาบาลและห้องเก็บยา", url: `${publicRoot}/wa-ve/medical-access-log.pdf` },
  { id: "asset-ka-wave-meeting", kind: "pdf", title: "บันทึกการใช้งานห้องประชุมส่วนตัว VIP ชั้น 60", url: `${publicRoot}/wa-ve/vip-meeting-log.pdf` },
  { id: "asset-ka-wave-inventory", kind: "pdf", title: "บันทึกคลังยาและเวชภัณฑ์ห้องพยาบาล WA-VE BLISS", url: `${publicRoot}/wa-ve/medical-inventory.pdf` },
  { id: "asset-ka-wave-phone", kind: "pdf", title: "บันทึกสัญญาณโทรศัพท์และเส้นทางการเงินของเบอร์นิรนาม", url: `${publicRoot}/wa-ve/phone-and-finance.pdf` },
  { id: "asset-ka-wave-fluid", kind: "pdf", title: "รายงานการตรวจวิเคราะห์วัตถุพยานของเหลวในขวดตัวอย่าง", url: `${publicRoot}/wa-ve/fluid-analysis.pdf` },
  { id: "asset-ka-wave-insulin", kind: "pdf", title: "รายงานการประเมินดัชนีความต้านทานอินซูลิน", url: `${publicRoot}/wa-ve/insulin-resistance.pdf` },
  { id: "asset-ka-wave-biochemical", kind: "pdf", title: "รายงานการวิเคราะห์อัตราส่วนทางชีวเคมี - WA-VE TOWER", url: `${publicRoot}/wa-ve/biochemical-analysis.pdf` },
  { id: "asset-ka-wave-forensic", kind: "pdf", title: "รายงานนิติเวชฉบับเต็ม ดร.เตเต้ เตชะเมธากุล", url: `${publicRoot}/wa-ve/forensic-report.pdf` },
  { id: "asset-ka-wave-preliminary", kind: "pdf", title: "รายงานเบื้องต้น ณ ที่เกิดเหตุ ดร.เตเต้ เตชะเมธากุล", url: `${publicRoot}/wa-ve/preliminary-report.pdf` },
  { id: "asset-ka-wave-health", kind: "pdf", title: "แฟ้มประวัติสุขภาพพนักงาน ดร.เตเต้ เตชะเมธากุล", url: `${publicRoot}/wa-ve/health-record.pdf` },
  { id: "asset-ka-wave-consulting", kind: "pdf", title: "ใบเบิกจ่ายค่าบริการที่ปรึกษาส่วนตัว", url: `${publicRoot}/wa-ve/consulting-invoice.pdf` },
];

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
  rubric: [
    "แบบจำลองเชิงสาเหตุและไทม์ไลน์ 4 คะแนน",
    "การใช้หลักฐานหลายประเภทและการเชื่อมโยงของหลักฐาน 4 คะแนน",
    "การแยกสิ่งที่ยืนยันได้ อนุมานได้ และยังไม่ทราบ 3 คะแนน",
    "เทคโนโลยีที่เฉพาะเจาะจงและสอดคล้องกับ failure mode ของคดี 4 คะแนน",
    "การออกแบบการป้องกันเป็นชั้น ข้อจำกัด และปัจจัยมนุษย์ 3 คะแนน",
    "ความชัดเจนของเหตุผลและความเชื่อมโยงระหว่างเทคโนโลยีกับโอกาสรอด 2 คะแนน",
  ],
  title: "ภารกิจหลังจบคดี",
} as const;
