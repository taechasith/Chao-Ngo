import { describe, expect, it } from "vitest";

import {
  assetKindForExtension,
  contentTypeForExtension,
  r2KeyForNodeZoneAsset,
} from "./node-zone";

const checksum = "a".repeat(64);

describe("NODE ZONE content helpers", () => {
  it("uses an approved, content-addressed public key", () => {
    expect(r2KeyForNodeZoneAsset("quantum", checksum, ".pdf")).toBe(
      `games/node-zone/quantum/${checksum}.pdf`,
    );
  });

  it("classifies the approved source formats", () => {
    expect(assetKindForExtension("png")).toBe("image");
    expect(assetKindForExtension("pdf")).toBe("pdf");
    expect(assetKindForExtension("csv")).toBe("text");
    expect(assetKindForExtension("py")).toBe("text");
    expect(assetKindForExtension("mp3")).toBe("audio");
  });

  it("returns browser-safe content types for published assets", () => {
    expect(contentTypeForExtension(".pdf")).toBe("application/pdf");
    expect(contentTypeForExtension("png")).toBe("image/png");
    expect(contentTypeForExtension("py")).toBe("text/x-python; charset=utf-8");
    expect(contentTypeForExtension("mp3")).toBe("audio/mpeg");
  });
});
