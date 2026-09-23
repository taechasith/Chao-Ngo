import {
  type AnswerAttachmentExtension,
  type SubmissionRequirements,
} from "./requirements";
import { hasPdfSignature } from "../storage/pdf-validation";

export type AnswerAttachmentValidation =
  | {
    detectedMime: string;
    extension: AnswerAttachmentExtension;
    originalName: string;
    success: true;
  }
  | { code: "ANSWER_ATTACHMENT_SIZE_INVALID" | "ANSWER_ATTACHMENT_TYPE_INVALID"; success: false };

function extensionFromFilename(filename: string): string | null {
  const basename = filename.split(/[\\/]/).pop()?.trim() ?? "";
  const dot = basename.lastIndexOf(".");
  if (dot <= 0 || dot === basename.length - 1) return null;
  return basename.slice(dot + 1).toLowerCase();
}

function containsAscii(bytes: Uint8Array, value: string): boolean {
  const expected = Array.from(value, (character) => character.charCodeAt(0));
  if (expected.length > bytes.length) return false;
  outer: for (let offset = 0; offset <= bytes.length - expected.length; offset += 1) {
    for (let index = 0; index < expected.length; index += 1) {
      if (bytes[offset + index] !== expected[index]) continue outer;
    }
    return true;
  }
  return false;
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
}

function isUtf8Text(bytes: Uint8Array): boolean {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0")) return false;
    return !/^\s*<(?:!doctype\s+html|html\b|head\b|body\b|script\b|iframe\b|svg\b|object\b|embed\b|meta\b|link\b)/i.test(text);
  } catch {
    return false;
  }
}

function hasExpectedSignature(extension: AnswerAttachmentExtension, bytes: Uint8Array): boolean {
  switch (extension) {
    case "txt":
      return isUtf8Text(bytes);
    case "pdf":
      return hasPdfSignature(bytes);
    case "png":
      return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
        bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    case "jpg":
    case "jpeg":
      return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
        bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
    case "docx":
      return hasZipSignature(bytes) && containsAscii(bytes, "[Content_Types].xml") &&
        containsAscii(bytes, "word/document.xml");
    case "pptx":
      return hasZipSignature(bytes) && containsAscii(bytes, "[Content_Types].xml") &&
        containsAscii(bytes, "ppt/presentation.xml");
  }
}

function detectedMimeFor(extension: AnswerAttachmentExtension): string {
  switch (extension) {
    case "txt": return "text/plain";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "pdf": return "application/pdf";
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
  }
}

export function safeAnswerAttachmentFilename(value: string, extension: AnswerAttachmentExtension): string {
  const basename = value.split(/[\\/]/).pop() ?? "answer";
  const printable = Array.from(basename)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
  const stem = printable.replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N}._ -]+/gu, "").trim();
  const safeStem = stem || "answer";
  const maxStemLength = Math.max(1, 180 - extension.length - 1);
  return `${safeStem.slice(0, maxStemLength)}.${extension}`;
}

export function validateAnswerAttachment(input: {
  bytes: Uint8Array;
  filename: string;
  requirements: Pick<SubmissionRequirements, "allowedAnswerAttachmentExtensions" | "maxAnswerAttachmentBytes">;
}): AnswerAttachmentValidation {
  if (!input.bytes.byteLength || input.bytes.byteLength > input.requirements.maxAnswerAttachmentBytes) {
    return { code: "ANSWER_ATTACHMENT_SIZE_INVALID", success: false };
  }

  const rawExtension = extensionFromFilename(input.filename);
  if (!rawExtension || !input.requirements.allowedAnswerAttachmentExtensions.includes(rawExtension as AnswerAttachmentExtension)) {
    return { code: "ANSWER_ATTACHMENT_TYPE_INVALID", success: false };
  }

  const extension = rawExtension as AnswerAttachmentExtension;
  if (!hasExpectedSignature(extension, input.bytes)) return { code: "ANSWER_ATTACHMENT_TYPE_INVALID", success: false };

  return {
    detectedMime: detectedMimeFor(extension),
    extension,
    originalName: safeAnswerAttachmentFilename(input.filename, extension),
    success: true,
  };
}
