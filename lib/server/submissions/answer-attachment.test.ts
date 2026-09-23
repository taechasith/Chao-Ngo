import { describe, expect, it } from "vitest";

import { safeAnswerAttachmentFilename, validateAnswerAttachment } from "./answer-attachment";
import type { SubmissionRequirements } from "./requirements";

const requirements: Pick<SubmissionRequirements, "allowedAnswerAttachmentExtensions" | "maxAnswerAttachmentBytes"> = {
  allowedAnswerAttachmentExtensions: ["txt", "docx", "pdf", "pptx", "png", "jpg", "jpeg"],
  maxAnswerAttachmentBytes: 20 * 1024 * 1024,
};

describe("answer attachment validation", () => {
  it("accepts a permitted, non-HTML UTF-8 text answer and removes path fragments", () => {
    const result = validateAnswerAttachment({
      bytes: new TextEncoder().encode("A concise case conclusion."),
      filename: "C:\\private\\answer.txt",
      requirements,
    });
    expect(result).toMatchObject({ detectedMime: "text/plain", originalName: "answer.txt", success: true });
  });

  it("rejects HTML content even when a caller disguises it as a text attachment", () => {
    expect(validateAnswerAttachment({
      bytes: new TextEncoder().encode("<!doctype html><script>alert(1)</script>"),
      filename: "answer.txt",
      requirements,
    })).toEqual({ code: "ANSWER_ATTACHMENT_TYPE_INVALID", success: false });
  });

  it("requires a matching image or Office magic signature", () => {
    expect(validateAnswerAttachment({
      bytes: new TextEncoder().encode("not an image"),
      filename: "proof.png",
      requirements,
    })).toEqual({ code: "ANSWER_ATTACHMENT_TYPE_INVALID", success: false });

    const docxBytes = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,
      ...new TextEncoder().encode("[Content_Types].xmlword/document.xml"),
    ]);
    expect(validateAnswerAttachment({ bytes: docxBytes, filename: "report.docx", requirements })).toMatchObject({
      detectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      success: true,
    });
  });

  it("never turns an unsupported filename into a valid attachment name", () => {
    expect(validateAnswerAttachment({
      bytes: new TextEncoder().encode("safe text"),
      filename: "answer.html",
      requirements,
    })).toEqual({ code: "ANSWER_ATTACHMENT_TYPE_INVALID", success: false });
    expect(safeAnswerAttachmentFilename("../../answer?.txt", "txt")).toBe("answer.txt");
  });
});
