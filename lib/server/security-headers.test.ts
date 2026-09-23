import { describe, expect, it } from "vitest";

import { withSecurityHeaders } from "./security-headers";

describe("security headers", () => {
  it("protects API responses and prevents caching research data", async () => {
    const response = withSecurityHeaders(new Response("ok"), new Request("https://example.test/api/submissions"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(response.headers.get("Content-Security-Policy")).not.toContain("unsafe-eval");
    expect(response.headers.get("Content-Security-Policy")).toContain("script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://challenges.cloudflare.com");
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'self' https://cloudflareinsights.com https://challenges.cloudflare.com");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-src 'self' https://challenges.cloudflare.com");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(await response.text()).toBe("ok");
  });
});
