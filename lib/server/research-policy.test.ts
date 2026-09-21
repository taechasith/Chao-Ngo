import { describe, expect, it } from "vitest";

import {
  isResearchCollectionReady,
  researchCollectionPolicy,
  researchNotice,
} from "./research-policy";

describe("research collection policy", () => {
  it("keeps collection unavailable until consent policy inputs are complete", () => {
    expect(isResearchCollectionReady(researchCollectionPolicy)).toBe(false);
    expect(researchCollectionPolicy.privateStorageReady).toBe(true);
  });

  it("keeps a complete notice versioned and adult-only", () => {
    expect(researchNotice.consentVersion).toBe(researchNotice.dataNoticeVersion);
    expect(researchNotice.minimumParticipantAge).toBe(18);
    expect(researchNotice.controllerContactEmail).toContain("@");
  });

  it("requires private storage before collection can be enabled", () => {
    expect(
      isResearchCollectionReady({
        consentVersion: "2026-09",
        dataNoticeVersion: "2026-09",
        enabled: true,
        minimumParticipantAge: 18,
        retentionAndWithdrawalPolicy: "retention-v1",
        privateStorageReady: false,
      }),
    ).toBe(false);

    expect(
      isResearchCollectionReady({
        consentVersion: "2026-09",
        dataNoticeVersion: "2026-09",
        enabled: true,
        minimumParticipantAge: 18,
        retentionAndWithdrawalPolicy: "retention-v1",
        privateStorageReady: true,
      }),
    ).toBe(true);
  });
});
