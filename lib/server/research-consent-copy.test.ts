import { describe, expect, it } from "vitest";

import {
  aiChatPdfConsentCheckboxLabel,
  aiChatUploadConsentVersion,
  approvedResearchConsentText,
  consentVersion,
  dataNoticeVersion,
  researchConsentCheckboxLabel,
} from "./research-consent-copy";

describe("approved research consent copy", () => {
  it("keeps research and PDF acknowledgement versions distinct", () => {
    expect(consentVersion).toBe(dataNoticeVersion);
    expect(aiChatUploadConsentVersion).not.toBe(consentVersion);
  });

  it("uses the configured retention duration in each disclosure", () => {
    expect(approvedResearchConsentText(3)).toContain("ไม่เกิน 3 ปี");
    expect(aiChatPdfConsentCheckboxLabel(5)).toContain("5 ปี");
    expect(researchConsentCheckboxLabel).toContain("ยินยอม");
  });
});
