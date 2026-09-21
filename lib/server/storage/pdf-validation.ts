export function hasPdfSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const header = new TextDecoder().decode(bytes.subarray(0, 5));
  const tail = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1_024)));
  return header === "%PDF-" && tail.includes("%%EOF");
}

export function safePdfFilename(value: string): string {
  const basename = value.split(/[\\/]/).pop() ?? "ai-chat.pdf";
  const safe = Array.from(basename)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim()
  if (!safe.toLowerCase().endsWith(".pdf")) return "ai-chat.pdf";
  return safe.length <= 180 ? safe : `${safe.slice(0, 176)}.pdf`;
}
