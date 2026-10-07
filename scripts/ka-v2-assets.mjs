import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import console from "node:console";
import process from "node:process";
import { URL } from "node:url";
import { Buffer } from "node:buffer";

const { fetch, AbortSignal } = globalThis;

const { assets } = JSON.parse(readFileSync(new URL("../lib/content/ka-v2-player-assets.json", import.meta.url), "utf8"));
const args = new Set(process.argv.slice(2));
for (const asset of assets) {
  const bytes = readFileSync(new URL("../public" + asset.localUrl, import.meta.url));
  if (bytes.length !== asset.bytes || createHash("sha256").update(bytes).digest("hex") !== asset.checksum) {
    throw new Error("Local original differs from manifest: " + asset.id);
  }
  if (!/^games\/ka-casefiles\/(maimee|wa-ve|personnel)\/v2\/[a-f0-9]{64}\.(pdf|png|txt)$/.test(asset.r2Key) ||
      asset.url !== "https://cdn.creativelabth.com/" + asset.r2Key) throw new Error("Unexpected public asset destination");
}
if (args.has("--upload")) {
  for (const asset of assets) {
    const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "r2", "object", "put",
      "creativelabth-public/" + asset.r2Key, "--remote", "--file", "public" + asset.localUrl,
      "--content-type", asset.contentType, "--cache-control", "public, max-age=31536000, immutable"],
    { stdio: "inherit" });
    if (result.status !== 0) throw new Error("Upload failed; content migration must not run: " + asset.id);
  }
}
if (args.has("--verify-remote")) {
  // Verify the actual bytes, including the 11 MB personnel PDF; HEAD alone cannot
  // detect an HTML error page served with a successful status.
  for (const asset of assets) {
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error("CDN request failed: " + asset.id + " (" + response.status + ")");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== asset.bytes || createHash("sha256").update(bytes).digest("hex") !== asset.checksum) {
      throw new Error("CDN bytes do not match original: " + asset.id);
    }
    console.log("Verified " + asset.id);
  }
}
console.log("Verified " + assets.length + " approved player originals. Answer keys are excluded.");
