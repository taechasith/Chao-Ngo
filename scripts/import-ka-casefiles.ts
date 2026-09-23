import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";

import { assertPublicAssetKey } from "../lib/server/assets/object-keys";
import { assetKindForExtension, contentTypeForExtension } from "../lib/server/content/node-zone";

config({ path: ".env.local" });

const sourceRoot = process.env.NETLOOD_CITY_ASSET_ROOT ?? "C:\\Users\\HP OMEN\\Downloads\\NETLOOD CITY";
const localPublicRoot = resolve(import.meta.dirname, "../public/ka-casefiles");

type Scope = "maimee" | "netlood-city" | "personnel" | "wa-ve";

type AssetSpec = {
  destination: string;
  id: string;
  scope: Scope;
  source: string;
  subgameId: "subgame-ka-fintech" | "subgame-ka-wa-ve" | null;
  timelineNodeId: string;
  title: string;
};

const shared: Omit<AssetSpec, "destination" | "id" | "source" | "title"> = {
  scope: "netlood-city",
  subgameId: null,
  timelineNodeId: "timeline-ka-netlood-city",
};

const personnel: Omit<AssetSpec, "destination" | "id" | "source" | "title"> = {
  scope: "personnel",
  subgameId: null,
  timelineNodeId: "timeline-ka-personnel",
};

const maimee: Omit<AssetSpec, "destination" | "id" | "source" | "title"> = {
  scope: "maimee",
  subgameId: "subgame-ka-fintech",
  timelineNodeId: "timeline-ka-maimee",
};

const waVe: Omit<AssetSpec, "destination" | "id" | "source" | "title"> = {
  scope: "wa-ve",
  subgameId: "subgame-ka-wa-ve",
  timelineNodeId: "timeline-ka-wa-ve",
};

// This is deliberately an allowlist. The `for game dev` folder and stale ZIP-only material never enter player content.
const assetSpecs: AssetSpec[] = [
  { ...shared, id: "asset-ka-netlood-story", source: "ก่อนเริ่มคดี/เนื้อเรื่องก่อนเกิดเหตุ.txt", destination: "netlood-city/incident-context.txt", title: "เนื้อเรื่องก่อนเกิดเหตุ" },
  { ...shared, id: "asset-ka-netlood-brief", source: "ก่อนเริ่มคดี/NetLood City.pdf", destination: "netlood-city/netlood-city.pdf", title: "NetLood City" },

  { ...personnel, id: "asset-ka-personnel-dossier", source: "บุคลากรในบริษัท/แฟ้มข้อมูลบุคลากรภายในบริษัท.pdf", destination: "personnel/personnel-dossier.pdf", title: "แฟ้มข้อมูลบุคลากรภายในบริษัท" },
  { ...personnel, id: "asset-ka-personnel-rafa", source: "บุคลากรในบริษัท/Dr. Rafa Varinmetha.png", destination: "personnel/rafa-varinmetha.png", title: "Dr. Rafa Varinmetha" },
  { ...personnel, id: "asset-ka-personnel-alexander", source: "บุคลากรในบริษัท/Mr. Alexander Volkov.png", destination: "personnel/alexander-volkov.png", title: "Mr. Alexander Volkov" },
  { ...personnel, id: "asset-ka-personnel-alisa", source: "บุคลากรในบริษัท/Mrs. Alisa Varinmetha.png", destination: "personnel/alisa-varinmetha.png", title: "Mrs. Alisa Varinmetha" },
  { ...personnel, id: "asset-ka-personnel-chiwa", source: "บุคลากรในบริษัท/ดร. ชีวา ภาพสันต์.png", destination: "personnel/chiwa-phapsan.png", title: "ดร. ชีวา ภาพสันต์" },
  { ...personnel, id: "asset-ka-personnel-surin", source: "บุคลากรในบริษัท/ดร. สุริญา ชมภูวิเศษ.png", destination: "personnel/surin-chomphuwiset.png", title: "ดร. สุริญา ชมภูวิเศษ" },
  { ...personnel, id: "asset-ka-personnel-tete", source: "บุคลากรในบริษัท/ดร.เตเต้ เตชะเมธากุล.png", destination: "personnel/tete-techametakun.png", title: "ดร.เตเต้ เตชะเมธากุล" },
  { ...personnel, id: "asset-ka-personnel-noppawan", source: "บุคลากรในบริษัท/นาง นพวรรณ แสงจ้า.png", destination: "personnel/noppawan-saengja.png", title: "นาง นพวรรณ แสงจ้า" },
  { ...personnel, id: "asset-ka-personnel-lalina", source: "บุคลากรในบริษัท/นาง ลลินา เตชะเมธากุล.png", destination: "personnel/lalina-techametakun.png", title: "นาง ลลินา เตชะเมธากุล" },
  { ...personnel, id: "asset-ka-personnel-hathairat", source: "บุคลากรในบริษัท/นาง หทัยรัตน์ ธำรงกิจ.png", destination: "personnel/hathairat-thamrongkit.png", title: "นาง หทัยรัตน์ ธำรงกิจ" },
  { ...personnel, id: "asset-ka-personnel-nalinee", source: "บุคลากรในบริษัท/นางสาว นลินี แสงจ้า.png", destination: "personnel/nalinee-saengja.png", title: "นางสาว นลินี แสงจ้า" },
  { ...personnel, id: "asset-ka-personnel-max", source: "บุคลากรในบริษัท/นาย แม็ก วงศ์วิศาล.png", destination: "personnel/max-wongsawisan.png", title: "นาย แม็ก วงศ์วิศาล" },
  { ...personnel, id: "asset-ka-personnel-korn", source: "บุคลากรในบริษัท/นาย กรณ์ รักษ์นิติ.png", destination: "personnel/korn-raknit.png", title: "นาย กรณ์ รักษ์นิติ" },
  { ...personnel, id: "asset-ka-personnel-kantapong", source: "บุคลากรในบริษัท/นาย กันตพงศ์ อภิเมธินทร์.png", destination: "personnel/kantapong-apimet.png", title: "นาย กันตพงศ์ อภิเมธินทร์" },
  { ...personnel, id: "asset-ka-personnel-tham", source: "บุคลากรในบริษัท/นาย ธาม ไทศิริ.png", destination: "personnel/tham-thaisiri.png", title: "นาย ธาม ไทศิริ" },
  { ...personnel, id: "asset-ka-personnel-phisit", source: "บุคลากรในบริษัท/นาย พิสิษฐ์ เตชานุกิจ.png", destination: "personnel/phisit-techanuwat.png", title: "นาย พิสิษฐ์ เตชานุกิจ" },
  { ...personnel, id: "asset-ka-personnel-somboon", source: "บุคลากรในบริษัท/นาย สมบูรณ์ ยะหะทัม.png", destination: "personnel/somboon-yahatam.png", title: "นาย สมบูรณ์ ยะหะทัม" },
  { ...personnel, id: "asset-ka-personnel-atchawin", source: "บุคลากรในบริษัท/นาย อาชวิน นาคาสิริ.png", destination: "personnel/atchawin-nakasiri.png", title: "นาย อาชวิน นาคาสิริ" },
  { ...personnel, id: "asset-ka-personnel-anawat", source: "บุคลากรในบริษัท/นายแพทย์ อนวัช พรหมพิริยะ.png", destination: "personnel/anawat-phompiriya.png", title: "นายแพทย์ อนวัช พรหมพิริยะ" },

  { ...maimee, id: "asset-ka-maimee-case-brief", source: "คดี MAIMEE (FinTech)/บันทึกที่เกิดเหตุ/ที่เกิดเหตุ และบันทึกการสืบสวนของคุณ.txt", destination: "maimee/case-brief.txt", title: "ที่เกิดเหตุ และบันทึกการสืบสวนของคุณ" },
  { ...maimee, id: "asset-ka-maimee-chat", source: "คดี MAIMEE (FinTech)/บันทึกที่เกิดเหตุ/Secure Chat Export Report.pdf", destination: "maimee/secure-chat.pdf", title: "Secure Chat Export Report" },
  { ...maimee, id: "asset-ka-maimee-timeline", source: "คดี MAIMEE (FinTech)/บันทึกที่เกิดเหตุ/รายงานการสอบสวนและไทม์ไลน์การเคลื่อนไหว.pdf", destination: "maimee/movement-timeline.pdf", title: "รายงานการสอบสวนและไทม์ไลน์การเคลื่อนไหว" },
  { ...maimee, id: "asset-ka-maimee-scene-01", source: "คดี MAIMEE (FinTech)/บันทึกที่เกิดเหตุ/ภาพถ่ายที่เกิดเหตุ01.png", destination: "maimee/scene-01.png", title: "ภาพถ่ายที่เกิดเหตุ 01" },
  { ...maimee, id: "asset-ka-maimee-scene-02", source: "คดี MAIMEE (FinTech)/บันทึกที่เกิดเหตุ/ภาพถ่ายที่เกิดเหตุ02.png", destination: "maimee/scene-02.png", title: "ภาพถ่ายที่เกิดเหตุ 02" },
  { ...maimee, id: "asset-ka-maimee-cctv", source: "คดี MAIMEE (FinTech)/บันทึกที่เกิดเหตุ/CCTV_04.png", destination: "maimee/cctv-04.png", title: "CCTV 04" },
  { ...maimee, id: "asset-ka-maimee-trophy", source: "คดี MAIMEE (FinTech)/บันทึกที่เกิดเหตุ/ถ้วยรางวัล.jpg", destination: "maimee/trophy.jpg", title: "ถ้วยรางวัล" },
  { ...maimee, id: "asset-ka-maimee-ledger", source: "คดี MAIMEE (FinTech)/บันทึกที่เกิดเหตุ/CU_07.html", destination: "maimee/cu-07-safe.txt", title: "CU 07 / บันทึกภายใน AEGIS" },

  { ...waVe, id: "asset-ka-wave-prelude", source: "คดี WA VE (Bio x Psychology)/ก่อนเริ่มคดี/ก่อนเสียชีวิต.txt", destination: "wa-ve/before-death.txt", title: "ก่อนเสียชีวิต" },
  { ...waVe, id: "asset-ka-wave-case-brief", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/ที่เกิดเหตุ และบันทึกการสืบสวน.txt", destination: "wa-ve/case-brief.txt", title: "ที่เกิดเหตุ และบันทึกการสืบสวน" },
  { ...waVe, id: "asset-ka-wave-chat-01", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/Secure Chat Export Report 01.pdf", destination: "wa-ve/secure-chat-01.pdf", title: "Secure Chat Export Report 01" },
  { ...waVe, id: "asset-ka-wave-chat-02", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/Secure Chat Export Report 02.pdf", destination: "wa-ve/secure-chat-02.pdf", title: "Secure Chat Export Report 02" },
  { ...waVe, id: "asset-ka-wave-chat-03", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/Secure Chat Export Report 03 syerror.pdf", destination: "wa-ve/secure-chat-03.pdf", title: "Secure Chat Export Report 03" },
  { ...waVe, id: "asset-ka-wave-witness", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/บันทึกการสอบปากคำพยานในคดี.pdf", destination: "wa-ve/witness-interviews.pdf", title: "บันทึกการสอบปากคำพยานในคดี" },
  { ...waVe, id: "asset-ka-wave-access", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/บันทึกการเข้าออกห้องพยาบาลและห้องเก็บยา.pdf", destination: "wa-ve/medical-access-log.pdf", title: "บันทึกการเข้าออกห้องพยาบาลและห้องเก็บยา" },
  { ...waVe, id: "asset-ka-wave-meeting", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/บันทึกการใช้งานห้องประชุมส่วนตัว VIP ชั้น 60.pdf", destination: "wa-ve/vip-meeting-log.pdf", title: "บันทึกการใช้งานห้องประชุมส่วนตัว VIP ชั้น 60" },
  { ...waVe, id: "asset-ka-wave-inventory", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/บันทึกคลังยาและเวชภัณฑ์ห้องพยาบาล WA-VE BLISS.pdf", destination: "wa-ve/medical-inventory.pdf", title: "บันทึกคลังยาและเวชภัณฑ์ห้องพยาบาล WA-VE BLISS" },
  { ...waVe, id: "asset-ka-wave-phone", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/บันทึกสัญญาณโทรศัพท์และเส้นทางการเงินของเบอร์นิรนาม.pdf", destination: "wa-ve/phone-and-finance.pdf", title: "บันทึกสัญญาณโทรศัพท์และเส้นทางการเงินของเบอร์นิรนาม" },
  { ...waVe, id: "asset-ka-wave-fluid", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/รายงานการตรวจวิเคราะห์วัตถุพยานของเหลวในขวดตัวอย่าง.pdf", destination: "wa-ve/fluid-analysis.pdf", title: "รายงานการตรวจวิเคราะห์วัตถุพยานของเหลวในขวดตัวอย่าง" },
  { ...waVe, id: "asset-ka-wave-insulin", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/รายงานการประเมินดัชนีความต้านทานอินซูลิน.pdf", destination: "wa-ve/insulin-resistance.pdf", title: "รายงานการประเมินดัชนีความต้านทานอินซูลิน" },
  { ...waVe, id: "asset-ka-wave-biochemical", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/รายงานการวิเคราะห์อัตราส่วนทางชีวเคมี - WA-VE TOWER.pdf", destination: "wa-ve/biochemical-analysis.pdf", title: "รายงานการวิเคราะห์อัตราส่วนทางชีวเคมี - WA-VE TOWER" },
  { ...waVe, id: "asset-ka-wave-forensic", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/รายงานนิติเวชฉบับเต็ม ดร.เตเต้ เตชะเมธากุล.pdf", destination: "wa-ve/forensic-report.pdf", title: "รายงานนิติเวชฉบับเต็ม ดร.เตเต้ เตชะเมธากุล" },
  { ...waVe, id: "asset-ka-wave-preliminary", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/รายงานเบื้องต้น ณ ที่เกิดเหตุ ดร.เตเต้ เตชะเมธากุล.pdf", destination: "wa-ve/preliminary-report.pdf", title: "รายงานเบื้องต้น ณ ที่เกิดเหตุ ดร.เตเต้ เตชะเมธากุล" },
  { ...waVe, id: "asset-ka-wave-health", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/แฟ้มประวัติสุขภาพพนักงาน ดร.เตเต้ เตชะเมธากุล.pdf", destination: "wa-ve/health-record.pdf", title: "แฟ้มประวัติสุขภาพพนักงาน ดร.เตเต้ เตชะเมธากุล" },
  { ...waVe, id: "asset-ka-wave-consulting", source: "คดี WA VE (Bio x Psychology)/บันทึกที่เกิดเหตุ/ใบเบิกจ่ายค่าบริการที่ปรึกษาส่วนตัว.pdf", destination: "wa-ve/consulting-invoice.pdf", title: "ใบเบิกจ่ายค่าบริการที่ปรึกษาส่วนตัว" },
];

type ImportOptions = {
  copyLocal: boolean;
  databaseTarget: "local" | "remote" | null;
  upload: boolean;
  uploadWithWrangler: boolean;
};

type KaAsset = AssetSpec & {
  bytes: number;
  checksum: string;
  contentType: string | undefined;
  extension: string;
  localPath: string;
  publicUrl: string | null;
  r2Key: string;
  sourcePath: string;
};

const uploadEnvironmentSchema = z.object({
  NEXT_PUBLIC_ASSET_BASE_URL: z.literal("https://cdn.creativelabth.com"),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BUCKET: z.literal("creativelabth-public").optional(),
  R2_ENDPOINT: z.url(),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
}).transform((environment, context) => {
  const publicBucket = environment.R2_PUBLIC_BUCKET ?? environment.R2_BUCKET;
  if (publicBucket !== "creativelabth-public") {
    context.addIssue({ code: "custom", message: "R2_PUBLIC_BUCKET must be creativelabth-public for K.A. public assets." });
    return z.NEVER;
  }
  if (!environment.R2_ENDPOINT.includes("c24fed68f8dc59cc339bd821d215bba8")) {
    context.addIssue({ code: "custom", message: "R2_ENDPOINT must target the Chao-Ngo Cloudflare project account for K.A. public assets." });
    return z.NEVER;
  }
  return { ...environment, R2_PUBLIC_BUCKET: publicBucket };
});

const publicAssetEnvironmentSchema = z.object({
  NEXT_PUBLIC_ASSET_BASE_URL: z.literal("https://cdn.creativelabth.com"),
});

function parseOptions(values: string[]): ImportOptions {
  const options: ImportOptions = { copyLocal: false, databaseTarget: null, upload: false, uploadWithWrangler: false };
  for (const value of values) {
    if (value === "--copy-local") options.copyLocal = true;
    else if (value === "--local") options.databaseTarget = "local";
    else if (value === "--remote") options.databaseTarget = "remote";
    else if (value === "--upload") options.upload = true;
    else if (value === "--wrangler-upload") options.uploadWithWrangler = true;
    else throw new Error("Usage: npm run content:import:ka -- [--copy-local] [--local|--remote] [--upload|--wrangler-upload]");
  }
  if (!options.copyLocal && !options.databaseTarget) throw new Error("Choose --copy-local and/or a D1 target.");
  if ((options.upload || options.uploadWithWrangler) && !options.databaseTarget) throw new Error("An upload mode requires --local or --remote.");
  if (options.upload && options.uploadWithWrangler) throw new Error("Choose either --upload or --wrangler-upload.");
  return options;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeHtmlText(source: string): string {
  const withoutActiveContent = source
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, "\"");
  return withoutActiveContent.replace(/\s{2,}/g, " ").trim() + "\n";
}

function assetBytes(path: string): Buffer {
  return path.toLowerCase().endsWith(".html")
    ? Buffer.from(safeHtmlText(readFileSync(path, "utf8")), "utf8")
    : readFileSync(path);
}

function extensionFor(spec: AssetSpec): string {
  return spec.source.toLowerCase().endsWith(".html") ? "txt" : spec.destination.split(".").at(-1)?.toLowerCase() ?? "";
}

function createAssets(publicAssetBaseUrl: string | undefined): KaAsset[] {
  return assetSpecs.map((spec) => {
    const localPath = join(sourceRoot, ...spec.source.split("/"));
    const bytes = assetBytes(localPath);
    const extension = extensionFor(spec);
    if (!extension) throw new Error(`K.A. asset has no safe extension: ${spec.source}`);
    const checksum = sha256(bytes);
    const r2Key = assertPublicAssetKey(`games/ka-casefiles/${spec.scope}/${checksum}.${extension}`);
    return {
      ...spec,
      bytes: bytes.byteLength,
      checksum,
      contentType: contentTypeForExtension(extension),
      extension,
      localPath,
      publicUrl: publicAssetBaseUrl ? new URL(r2Key, `${publicAssetBaseUrl}/`).toString() : null,
      r2Key,
      sourcePath: `netlood-city/${spec.source}`,
    };
  });
}

function copyLocalRuntimeAssets(assets: KaAsset[]): void {
  for (const asset of assets) {
    const destination = join(localPublicRoot, ...asset.destination.split("/"));
    mkdirSync(dirname(destination), { recursive: true });
    if (asset.localPath.toLowerCase().endsWith(".html")) writeFileSync(destination, assetBytes(asset.localPath));
    else copyFileSync(asset.localPath, destination);
  }
}

function sqlLiteral(value: boolean | number | string | null): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function createSeedSql(assets: KaAsset[]): string {
  return assets.map((asset, index) => {
    const metadata = JSON.stringify({
      bytes: asset.bytes,
      contentType: asset.contentType ?? null,
      source: "netlood-city-approved-player-asset",
      sourcePath: asset.sourcePath,
      transformedFromHtml: asset.localPath.toLowerCase().endsWith(".html"),
    });
    return `INSERT INTO assets (
      id, subgame_id, timeline_node_id, title, kind, r2_key, public_url,
      player_visible, sort_order, checksum, source_path, metadata_json
    ) VALUES (
      ${sqlLiteral(asset.id)}, ${sqlLiteral(asset.subgameId)}, ${sqlLiteral(asset.timelineNodeId)},
      ${sqlLiteral(asset.title)}, ${sqlLiteral(assetKindForExtension(asset.extension))}, ${sqlLiteral(asset.r2Key)},
      ${sqlLiteral(asset.publicUrl)}, 1, ${sqlLiteral(index + 1)}, ${sqlLiteral(asset.checksum)},
      ${sqlLiteral(asset.sourcePath)}, ${sqlLiteral(metadata)}
    ) ON CONFLICT(source_path) DO UPDATE SET
      subgame_id = excluded.subgame_id, timeline_node_id = excluded.timeline_node_id, title = excluded.title,
      kind = excluded.kind, r2_key = excluded.r2_key, public_url = excluded.public_url,
      player_visible = excluded.player_visible, sort_order = excluded.sort_order, checksum = excluded.checksum,
      metadata_json = excluded.metadata_json, updated_at = CURRENT_TIMESTAMP;`;
  }).join("\n\n") + "\n";
}

async function uploadAssets(assets: KaAsset[]): Promise<{ reused: number; uploaded: number }> {
  const environment = uploadEnvironmentSchema.parse(process.env);
  const client = new S3Client({
    credentials: { accessKeyId: environment.R2_ACCESS_KEY_ID, secretAccessKey: environment.R2_SECRET_ACCESS_KEY },
    endpoint: environment.R2_ENDPOINT,
    region: "auto",
  });
  let reused = 0;
  let uploaded = 0;
  for (const asset of assets) {
    try {
      const existing = await client.send(new HeadObjectCommand({ Bucket: environment.R2_PUBLIC_BUCKET, Key: asset.r2Key }));
      if (existing.Metadata?.sha256 === asset.checksum) { reused += 1; continue; }
      throw new Error(`An unexpected object already exists for ${asset.r2Key}.`);
    } catch (error) {
      if (error instanceof Error && error.name !== "NotFound" && error.name !== "NoSuchKey") throw error;
    }
    const body = asset.localPath.toLowerCase().endsWith(".html") ? assetBytes(asset.localPath) : createReadStream(asset.localPath);
    await client.send(new PutObjectCommand({
      Body: body,
      Bucket: environment.R2_PUBLIC_BUCKET,
      ContentLength: asset.bytes,
      ContentType: asset.contentType,
      Key: asset.r2Key,
      Metadata: { sha256: asset.checksum },
    }));
    uploaded += 1;
  }
  return { reused, uploaded };
}

function uploadAssetsWithWrangler(assets: KaAsset[]): { reused: number; uploaded: number } {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "chao-ngo-ka-r2-"));
  try {
    for (const asset of assets) {
      const safeUploadPath = asset.localPath.toLowerCase().endsWith(".html")
        ? join(temporaryDirectory, `${asset.id}.txt`)
        : asset.localPath;
      if (safeUploadPath !== asset.localPath) writeFileSync(safeUploadPath, assetBytes(asset.localPath));
      const args = [
        resolve(import.meta.dirname, "../node_modules/wrangler/bin/wrangler.js"),
        "r2", "object", "put", `creativelabth-public/${asset.r2Key}`, "--remote", "--file", safeUploadPath,
      ];
      if (asset.contentType) args.push("--content-type", asset.contentType);
      execFileSync(process.execPath, args, { cwd: resolve(import.meta.dirname, ".."), stdio: "inherit" });
    }
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
  return { reused: 0, uploaded: assets.length };
}

function applySql(sql: string, databaseTarget: "local" | "remote"): void {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "chao-ngo-ka-"));
  const sqlPath = join(temporaryDirectory, "ka-assets.sql");
  try {
    writeFileSync(sqlPath, sql, "utf8");
    execFileSync(process.execPath, [
      resolve(import.meta.dirname, "../node_modules/wrangler/bin/wrangler.js"),
      "d1", "execute", "DB", `--${databaseTarget}`, "--file", sqlPath,
    ], { cwd: resolve(import.meta.dirname, ".."), stdio: "inherit" });
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const environment = options.upload ? uploadEnvironmentSchema.parse(process.env) : null;
  const publicAssetEnvironment = (options.upload || options.uploadWithWrangler)
    ? publicAssetEnvironmentSchema.parse(process.env)
    : null;
  const assets = createAssets(environment?.NEXT_PUBLIC_ASSET_BASE_URL ?? publicAssetEnvironment?.NEXT_PUBLIC_ASSET_BASE_URL);
  if (options.copyLocal) copyLocalRuntimeAssets(assets);
  const uploadResult = options.upload
    ? await uploadAssets(assets)
    : options.uploadWithWrangler ? uploadAssetsWithWrangler(assets) : null;
  if (options.databaseTarget) applySql(createSeedSql(assets), options.databaseTarget);
  if (options.copyLocal) console.info(`Copied ${assets.length} approved K.A. player assets into public/ka-casefiles.`);
  if (options.databaseTarget) console.info(`Imported ${assets.length} K.A. asset records into ${options.databaseTarget} D1.`);
  if (uploadResult) console.info(`R2 objects uploaded: ${uploadResult.uploaded}; reused: ${uploadResult.reused}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "K.A. content import failed.");
  process.exitCode = 1;
});
