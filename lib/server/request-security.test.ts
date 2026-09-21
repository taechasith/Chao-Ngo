import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "./request-security";

describe("same-origin mutation guard", () => {
  it("accepts same-origin browser mutations", () => {
    expect(isSameOriginRequest(new Request("https://player.example/api/submissions", {
      headers: { origin: "https://player.example", "sec-fetch-site": "same-origin" },
    }))).toBe(true);
  });

  it("rejects cross-origin and cross-site mutations", () => {
    expect(isSameOriginRequest(new Request("https://player.example/api/submissions", {
      headers: { origin: "https://attacker.example" },
    }))).toBe(false);
    expect(isSameOriginRequest(new Request("https://player.example/api/submissions", {
      headers: { "sec-fetch-site": "cross-site" },
    }))).toBe(false);
  });
});
