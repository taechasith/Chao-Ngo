import { describe, expect, it } from "vitest";

import { hasPdfSignature, safePdfFilename } from "./pdf-validation";

describe("private PDF validation", () => {
  it("requires a PDF header and end marker", () => {
    expect(hasPdfSignature(new TextEncoder().encode("%PDF-1.7\nbody\n%%EOF\n"))).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode("%PDF-1.7\nbody"))).toBe(false);
    expect(hasPdfSignature(new TextEncoder().encode("not a pdf %%EOF"))).toBe(false);
  });

  it("reduces path-like filenames to a bounded PDF basename", () => {
    expect(safePdfFilename("C:\\private\\chat.PDF")).toBe("chat.PDF");
    expect(safePdfFilename("../../not-pdf.txt")).toBe("ai-chat.pdf");
    expect(safePdfFilename(`${"a".repeat(220)}.pdf`)).toHaveLength(180);
  });
});
