import { readBoundedBody } from "../request-body";

export async function readBoundedJson(request: Request, maximumBytes = 12_000): Promise<unknown | null> {
  const bytes = await readBoundedBody(request, maximumBytes);
  if (!bytes?.byteLength) return null;

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return null;
  }
}
