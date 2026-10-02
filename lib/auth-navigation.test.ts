import { describe, expect, it } from "vitest";
import { authDestination, googleSignInError } from "./auth-navigation";

describe("Google auth navigation", () => {
  it("keeps local case destinations and rejects external or malformed destinations", () => {
    expect(authDestination("/submit?subgameId=subgame-ka-fintech#submission-stage-case")).toBe("/submit?subgameId=subgame-ka-fintech#submission-stage-case");
    for (const next of [undefined, "https://attacker.test", "//attacker.test", "/\\attacker.test", "/\n/attacker.test"]) expect(authDestination(next)).toBe("/onboarding");
  });
  it("explains cancellation and expired state without echoing provider error text", () => {
    expect(googleSignInError("access_denied")).toContain("ยกเลิก");
    expect(googleSignInError("state_mismatch")).toContain("หมดอายุ");
    expect(googleSignInError("private-token")).not.toContain("private-token");
  });
});
