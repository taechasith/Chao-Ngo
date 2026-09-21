import { assertPublicAssetKey } from "../assets/object-keys";

export const nodeZoneAssetScopes = ["pre-case", "quantum", "space", "post-case"] as const;

export type NodeZoneAssetScope = (typeof nodeZoneAssetScopes)[number];

const objectKeyPrefixes: Record<NodeZoneAssetScope, string> = {
  "post-case": "games/node-zone/post-case",
  "pre-case": "games/node-zone/pre-case",
  quantum: "games/node-zone/quantum",
  space: "games/node-zone/space",
};

const audioExtensions = new Set(["mp3"]);
const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const textExtensions = new Set(["csv", "json", "py", "txt"]);

export function assetKindForExtension(
  extension: string,
): "audio" | "image" | "pdf" | "text" | "other" {
  const normalized = extension.replace(/^\./, "").toLowerCase();

  if (audioExtensions.has(normalized)) {
    return "audio";
  }

  if (imageExtensions.has(normalized)) {
    return "image";
  }

  if (normalized === "pdf") {
    return "pdf";
  }

  if (textExtensions.has(normalized)) {
    return "text";
  }

  return "other";
}

export function contentTypeForExtension(extension: string): string | undefined {
  const normalized = extension.replace(/^\./, "").toLowerCase();
  const contentTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    csv: "text/csv; charset=utf-8",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    json: "application/json",
    pdf: "application/pdf",
    png: "image/png",
    py: "text/x-python; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    webp: "image/webp",
  };

  return contentTypes[normalized];
}

export function r2KeyForNodeZoneAsset(
  scope: NodeZoneAssetScope,
  checksum: string,
  extension: string,
): string {
  const normalizedChecksum = checksum.toLowerCase();
  const normalizedExtension = extension.replace(/^\./, "").toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(normalizedChecksum) || !/^[a-z0-9]+$/.test(normalizedExtension)) {
    throw new Error("NODE ZONE asset inputs must contain a SHA-256 checksum and file extension.");
  }

  return assertPublicAssetKey(
    `${objectKeyPrefixes[scope]}/${normalizedChecksum}.${normalizedExtension}`,
  );
}
