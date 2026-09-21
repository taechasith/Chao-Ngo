import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { createReadStream, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { z } from "zod";

import { assertPublicAssetKey } from "../lib/server/assets/object-keys";
import { contentTypeForExtension } from "../lib/server/content/node-zone";

config({ path: ".env.local" });

const environmentSchema = z.object({
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BUCKET: z.literal("creativelabth-public").optional(),
  R2_ENDPOINT: z.url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  NEXT_PUBLIC_ASSET_BASE_URL: z.url(),
}).transform((environment, context) => {
  const publicBucket = environment.R2_PUBLIC_BUCKET ?? environment.R2_BUCKET;

  if (publicBucket !== "creativelabth-public") {
    context.addIssue({
      code: "custom",
      message: "R2_PUBLIC_BUCKET must be creativelabth-public for public asset uploads.",
    });
    return z.NEVER;
  }

  return {
    ...environment,
    R2_PUBLIC_BUCKET: publicBucket,
  };
});

function contentTypeFor(filename: string): string | undefined {
  return contentTypeForExtension(filename.split(".").pop() ?? "");
}

async function main(): Promise<void> {
  const [localFile, rawKey] = process.argv.slice(2);
  if (!localFile || !rawKey) {
    throw new Error("Usage: npm run asset -- <local-file> <r2-key>");
  }

  const key = assertPublicAssetKey(rawKey);
  const sourcePath = resolve(localFile);
  const source = statSync(sourcePath);
  if (!source.isFile()) {
    throw new Error("The local asset path must point to a file.");
  }

  const environment = environmentSchema.parse(process.env);
  const client = new S3Client({
    region: "auto",
    endpoint: environment.R2_ENDPOINT,
    credentials: {
      accessKeyId: environment.R2_ACCESS_KEY_ID,
      secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: environment.R2_PUBLIC_BUCKET,
      Key: key,
      Body: createReadStream(sourcePath),
      ContentLength: source.size,
      ContentType: contentTypeFor(basename(sourcePath)),
    }),
  );

  const publicUrl = new URL(key, `${environment.NEXT_PUBLIC_ASSET_BASE_URL}/`).toString();
  console.info(`Uploaded: ${publicUrl}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Asset upload failed.";
  console.error(message);
  process.exitCode = 1;
});
