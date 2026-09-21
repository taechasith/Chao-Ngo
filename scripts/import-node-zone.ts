import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { createHash } from "node:crypto";
import {
  createReadStream,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, extname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";

import {
  assetKindForExtension,
  contentTypeForExtension,
  type NodeZoneAssetScope,
  r2KeyForNodeZoneAsset,
} from "../lib/server/content/node-zone";

config({ path: ".env.local" });

const sourceRoot = process.env.NODE_ZONE_ASSET_ROOT ?? "C:\\Users\\HP OMEN\\Downloads\\NODE ZONE game asset";

const sourceDefinitions: Array<{
  scope: NodeZoneAssetScope;
  sourceDirectory: string;
  subgameId: string | null;
  timelineNodeId: string;
}> = [
  {
    scope: "pre-case",
    sourceDirectory: "ก่อนคดี1",
    subgameId: null,
    timelineNodeId: "timeline-node-zone-pre-case",
  },
  {
    scope: "quantum",
    sourceDirectory: "คดี1 (Quantum)_ THE CORRECT TRAJECTORY",
    subgameId: "subgame-node-zone-quantum",
    timelineNodeId: "timeline-node-zone-quantum",
  },
  {
    scope: "space",
    sourceDirectory: "คดี2 (Space)_ THIRTEEN DAYS IN UTOPIA",
    subgameId: "subgame-node-zone-space",
    timelineNodeId: "timeline-node-zone-space",
  },
  {
    scope: "post-case",
    sourceDirectory: "หลังจบคดี",
    subgameId: null,
    timelineNodeId: "timeline-node-zone-post-case",
  },
];

const uploadEnvironmentSchema = z.object({
  NEXT_PUBLIC_ASSET_BASE_URL: z.url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BUCKET: z.literal("creativelabth-public").optional(),
  R2_ENDPOINT: z.url(),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
}).transform((environment, context) => {
  const publicBucket = environment.R2_PUBLIC_BUCKET ?? environment.R2_BUCKET;

  if (publicBucket !== "creativelabth-public") {
    context.addIssue({
      code: "custom",
      message: "R2_PUBLIC_BUCKET must be creativelabth-public for NODE ZONE public asset uploads.",
    });
    return z.NEVER;
  }

  return {
    ...environment,
    R2_PUBLIC_BUCKET: publicBucket,
  };
});

type ImportOptions = {
  databaseTarget: "local" | "remote";
  upload: boolean;
};

type NodeZoneAsset = {
  bytes: number;
  checksum: string;
  contentType?: string;
  extension: string;
  id: string;
  kind: "audio" | "image" | "pdf" | "text" | "other";
  localPath: string;
  publicUrl: string | null;
  r2Key: string;
  scope: NodeZoneAssetScope;
  sortOrder: number;
  sourcePath: string;
  subgameId: string | null;
  timelineNodeId: string;
  title: string;
};

function parseOptions(values: string[]): ImportOptions {
  const options: ImportOptions = {
    databaseTarget: "local",
    upload: false,
  };

  for (const value of values) {
    if (value === "--local") {
      options.databaseTarget = "local";
    } else if (value === "--remote") {
      options.databaseTarget = "remote";
    } else if (value === "--upload") {
      options.upload = true;
    } else {
      throw new Error("Usage: npm run content:import -- [--local|--remote] [--upload]");
    }
  }

  return options;
}

function listSourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== "__pycache__") {
        files.push(...listSourceFiles(entryPath));
      }
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sqlLiteral(value: boolean | number | string | null): string {
  if (value === null) {
    return "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  if (typeof value === "number") {
    return String(value);
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function createAssets(publicAssetBaseUrl: string | undefined): NodeZoneAsset[] {
  const assets: NodeZoneAsset[] = [];

  for (const definition of sourceDefinitions) {
    const directory = join(sourceRoot, definition.sourceDirectory);
    const files = listSourceFiles(directory);

    files.forEach((localPath, index) => {
      const extension = extname(localPath).slice(1).toLowerCase();

      if (!extension) {
        throw new Error(`NODE ZONE asset has no file extension: ${localPath}`);
      }

      const sourcePath = `node-zone/${definition.scope}/${relative(directory, localPath).replaceAll("\\", "/")}`;
      const checksum = sha256(readFileSync(localPath));
      const r2Key = r2KeyForNodeZoneAsset(definition.scope, checksum, extension);
      const assetId = `asset-node-zone-${sha256(sourcePath).slice(0, 24)}`;

      assets.push({
        bytes: statSync(localPath).size,
        checksum,
        contentType: contentTypeForExtension(extension),
        extension,
        id: assetId,
        kind: assetKindForExtension(extension),
        localPath,
        publicUrl: publicAssetBaseUrl
          ? new URL(r2Key, `${publicAssetBaseUrl}/`).toString()
          : null,
        r2Key,
        scope: definition.scope,
        sortOrder: index + 1,
        sourcePath,
        subgameId: definition.subgameId,
        timelineNodeId: definition.timelineNodeId,
        title: basename(localPath),
      });
    });
  }

  return assets;
}

function createSeedSql(assets: NodeZoneAsset[]): string {
  const statements = assets.map((asset) => {
    const metadata = JSON.stringify({
      bytes: asset.bytes,
      contentType: asset.contentType ?? null,
      source: "approved-node-zone-folder",
      sourcePath: asset.sourcePath,
    });

    return `INSERT INTO assets (
      id, subgame_id, timeline_node_id, title, kind, r2_key, public_url,
      player_visible, sort_order, checksum, source_path, metadata_json
    ) VALUES (
      ${sqlLiteral(asset.id)},
      ${sqlLiteral(asset.subgameId)},
      ${sqlLiteral(asset.timelineNodeId)},
      ${sqlLiteral(asset.title)},
      ${sqlLiteral(asset.kind)},
      ${sqlLiteral(asset.r2Key)},
      ${sqlLiteral(asset.publicUrl)},
      1,
      ${sqlLiteral(asset.sortOrder)},
      ${sqlLiteral(asset.checksum)},
      ${sqlLiteral(asset.sourcePath)},
      ${sqlLiteral(metadata)}
    ) ON CONFLICT(source_path) DO UPDATE SET
      subgame_id = excluded.subgame_id,
      timeline_node_id = excluded.timeline_node_id,
      title = excluded.title,
      kind = excluded.kind,
      r2_key = excluded.r2_key,
      public_url = excluded.public_url,
      player_visible = excluded.player_visible,
      sort_order = excluded.sort_order,
      checksum = excluded.checksum,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP;`;
  });

  return `${statements.join("\n\n")}\n`;
}

async function uploadAssets(
  assets: NodeZoneAsset[],
): Promise<{ reused: number; uploaded: number }> {
  const environment = uploadEnvironmentSchema.parse(process.env);
  const client = new S3Client({
    credentials: {
      accessKeyId: environment.R2_ACCESS_KEY_ID,
      secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
    },
    endpoint: environment.R2_ENDPOINT,
    region: "auto",
  });
  let reused = 0;
  let uploaded = 0;

  for (const asset of assets) {
    try {
      const existing = await client.send(
        new HeadObjectCommand({
          Bucket: environment.R2_PUBLIC_BUCKET,
          Key: asset.r2Key,
        }),
      );

      if (existing.Metadata?.sha256 === asset.checksum) {
        reused += 1;
        continue;
      }

      throw new Error(`An unexpected object already exists for ${asset.r2Key}.`);
    } catch (error) {
      if (error instanceof Error && error.name !== "NotFound" && error.name !== "NoSuchKey") {
        throw error;
      }
    }

    await client.send(
      new PutObjectCommand({
        Body: createReadStream(asset.localPath),
        Bucket: environment.R2_PUBLIC_BUCKET,
        ContentLength: asset.bytes,
        ContentType: asset.contentType,
        Key: asset.r2Key,
        Metadata: {
          sha256: asset.checksum,
        },
      }),
    );
    uploaded += 1;
  }

  return { reused, uploaded };
}

function applySql(sql: string, databaseTarget: ImportOptions["databaseTarget"]): void {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "chao-ngo-node-zone-"));
  const sqlPath = join(temporaryDirectory, "node-zone-assets.sql");

  try {
    writeFileSync(sqlPath, sql, "utf8");
    execFileSync(
      process.execPath,
      [
        resolve(import.meta.dirname, "../node_modules/wrangler/bin/wrangler.js"),
        "d1",
        "execute",
        "DB",
        `--${databaseTarget}`,
        "--file",
        sqlPath,
      ],
      {
        cwd: resolve(import.meta.dirname, ".."),
        stdio: "inherit",
      },
    );
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const publicAssetBaseUrl = options.upload
    ? uploadEnvironmentSchema.parse(process.env).NEXT_PUBLIC_ASSET_BASE_URL
    : undefined;
  const assets = createAssets(publicAssetBaseUrl);

  const uploadResult = options.upload ? await uploadAssets(assets) : null;

  applySql(createSeedSql(assets), options.databaseTarget);
  console.info(`Imported ${assets.length} approved NODE ZONE asset records.`);

  if (uploadResult) {
    console.info(`R2 objects uploaded: ${uploadResult.uploaded}; reused: ${uploadResult.reused}.`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "NODE ZONE import failed.";
  console.error(message);
  process.exitCode = 1;
});
