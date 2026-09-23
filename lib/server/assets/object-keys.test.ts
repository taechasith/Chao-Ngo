import { describe, expect, it } from "vitest";

import { assertPublicAssetKey } from "./object-keys";

describe("assertPublicAssetKey", () => {
  it("accepts approved NODE ZONE public keys", () => {
    expect(assertPublicAssetKey("games/node-zone/quantum/incident-brief.pdf")).toBe(
      "games/node-zone/quantum/incident-brief.pdf",
    );
  });

  it("accepts approved K.A. Casefiles public keys", () => {
    expect(assertPublicAssetKey("games/ka-casefiles/wa-ve/incident-brief.pdf")).toBe(
      "games/ka-casefiles/wa-ve/incident-brief.pdf",
    );
  });

  it("rejects private or traversal-style keys", () => {
    expect(() => assertPublicAssetKey("uploads/private.pdf")).toThrow();
    expect(() => assertPublicAssetKey("games/node-zone/../private.pdf")).toThrow();
  });
});
