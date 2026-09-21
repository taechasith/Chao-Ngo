const PRIVATE_UPLOAD_PREFIX = "research-uploads/";
const SAFE_EXTENSION_PATTERN = /^[a-z0-9]{1,12}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;

export const privateUploadBucketName = "creativelabth-private";
export const privateUploadBindingName = "PRIVATE_UPLOADS";

export type PrivateUploadKeyInput = {
  extension?: string;
  submissionId: string;
  uploadId: string;
  userId: string;
};

function assertSafeId(label: string, value: string): string {
  const trimmed = value.trim();

  if (!SAFE_ID_PATTERN.test(trimmed)) {
    throw new Error(`${label} must be a safe storage identifier.`);
  }

  return trimmed;
}

export function privateUploadKeyFor(input: PrivateUploadKeyInput): string {
  const userId = assertSafeId("userId", input.userId);
  const submissionId = assertSafeId("submissionId", input.submissionId);
  const uploadId = assertSafeId("uploadId", input.uploadId);
  const extension = input.extension?.trim().toLowerCase() || "pdf";

  if (!SAFE_EXTENSION_PATTERN.test(extension)) {
    throw new Error("extension must be a safe file extension.");
  }

  return `${PRIVATE_UPLOAD_PREFIX}${userId}/${submissionId}/${uploadId}.${extension}`;
}

export function assertPrivateUploadKey(value: string): string {
  const key = value.trim();

  if (
    !key.startsWith(PRIVATE_UPLOAD_PREFIX) ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("..")
  ) {
    throw new Error("The private upload key must stay under the approved private prefix.");
  }

  return key;
}
