import { describe, expect, it } from "vitest";

import { assertPublicAssetKey } from "../assets/object-keys";
import {
  assertPrivateUploadKey,
  privateUploadBucketName,
  privateUploadKeyFor,
} from "./private-r2";

describe("private R2 upload storage", () => {
  it("uses the configured private bucket name", () => {
    expect(privateUploadBucketName).toBe("creativelabth-private");
  });

  it("generates private upload keys under a non-public prefix", () => {
    const key = privateUploadKeyFor({
      submissionId: "submission_123456",
      uploadId: "upload_abcdef",
      userId: "user_abcdef",
    });

    expect(key).toBe("research-uploads/user_abcdef/submission_123456/upload_abcdef.pdf");
    expect(assertPrivateUploadKey(key)).toBe(key);
    expect(() => assertPublicAssetKey(key)).toThrow();
  });

  it("rejects traversal and unsafe identifiers", () => {
    expect(() =>
      privateUploadKeyFor({
        submissionId: "../submission",
        uploadId: "upload_abcdef",
        userId: "user_abcdef",
      }),
    ).toThrow();
    expect(() => assertPrivateUploadKey("research-uploads/user/../file.pdf")).toThrow();
    expect(() => assertPrivateUploadKey("games/node-zone/quantum/file.pdf")).toThrow();
  });
});
