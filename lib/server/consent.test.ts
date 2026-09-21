import { describe, expect, it } from "vitest";

import { consentRecordInputSchema } from "./consent";

describe("consentRecordInputSchema", () => {
  it("accepts an explicit research choice", () => {
    expect(
      consentRecordInputSchema.safeParse({
        aiChatUploadConsent: false,
        consentVersion: "2026-09",
        dataNoticeVersion: "2026-09",
        researchParticipation: true,
      }).success,
    ).toBe(true);
  });

  it("does not accept upload consent without research participation", () => {
    expect(
      consentRecordInputSchema.safeParse({
        aiChatUploadConsent: true,
        consentVersion: "2026-09",
        dataNoticeVersion: "2026-09",
        researchParticipation: false,
      }).success,
    ).toBe(false);
  });
});
