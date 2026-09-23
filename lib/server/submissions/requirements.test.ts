import { describe, expect, it } from "vitest";

import { fallbackSubmissionRequirements } from "./requirements";

describe("submission requirement fallbacks", () => {
  it("keeps the legacy NODE ZONE submission contract when no requirements row exists", () => {
    expect(fallbackSubmissionRequirements("subgame-node-zone-quantum")).toMatchObject({
      allowedAnswerAttachmentExtensions: [],
      maxAnswerAttachmentBytes: 20 * 1024 * 1024,
      requiresAiChatPdf: true,
      requiresAnswerTextOrAttachment: true,
      requiresPosttest: true,
    });
  });

  it("uses the safe NETLOOD CITY fallback until its requirements row is available", () => {
    expect(fallbackSubmissionRequirements("subgame-ka-fintech")).toMatchObject({
      allowedAnswerAttachmentExtensions: ["txt", "docx", "pdf", "pptx", "png", "jpg", "jpeg"],
      requiresAiChatPdf: false,
      requiresAnswerTextOrAttachment: true,
      requiresPosttest: false,
    });
  });
});
