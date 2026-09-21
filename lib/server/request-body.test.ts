import { describe, expect, it } from "vitest";

import { readBoundedBody } from "./request-body";
import { readBoundedJson } from "./questionnaires/request";

describe("bounded request bodies", () => {
  it("counts UTF-8 bytes, not characters", async () => {
    expect(await readBoundedJson(new Request("https://example.test", { method: "POST", body: '"ไทย"' }), 6)).toBeNull();
  });

  it("stops a stream without a Content-Length", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(16)); },
      cancel() { cancelled = true; },
    });
    const request = new Request("https://example.test", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await readBoundedBody(request, 8)).toBeNull();
    expect(cancelled).toBe(true);
  });

  it("parses bounded valid JSON and rejects malformed JSON", async () => {
    const request = (body: string) => new Request("https://example.test", { method: "POST", body });
    expect(await readBoundedJson(request('{"answer":42}'))).toEqual({ answer: 42 });
    expect(await readBoundedJson(request('{broken'))).toBeNull();
  });
});
