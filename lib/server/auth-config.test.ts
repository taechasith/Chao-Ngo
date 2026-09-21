import { describe, expect, it } from "vitest";

import { getAuthReadiness, minimumAuthSecretLength } from "./auth-config";

describe("getAuthReadiness", () => {
  it("fails closed without a high-entropy-length secret", () => {
    expect(getAuthReadiness({})).toEqual({ isReady: false });
    expect(
      getAuthReadiness({
        secret: "x".repeat(minimumAuthSecretLength - 1),
      }),
    ).toEqual({ isReady: false });
  });

  it("accepts a valid app URL only with a sufficiently long secret", () => {
    expect(
      getAuthReadiness({
        baseURL: "http://localhost:3000/",
        secret: "x".repeat(minimumAuthSecretLength),
      }),
    ).toEqual({
      baseURL: "http://localhost:3000",
      isReady: true,
      secret: "x".repeat(minimumAuthSecretLength),
    });
  });

  it("rejects a non-http auth URL", () => {
    expect(
      getAuthReadiness({
        baseURL: "ftp://example.test",
        secret: "x".repeat(minimumAuthSecretLength),
      }),
    ).toEqual({ isReady: false });
  });
});
