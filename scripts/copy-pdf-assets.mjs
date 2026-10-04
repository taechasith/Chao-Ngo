import { cp, mkdir } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../node_modules/pdfjs-dist/", import.meta.url));
const destination = fileURLToPath(new URL("../public/pdfjs/", import.meta.url));
await mkdir(destination, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "wasm"]) await cp(`${source}${directory}`, `${destination}${directory}`, { recursive: true });
await cp(`${source}build/pdf.worker.min.mjs`, `${destination}pdf.worker.min.mjs`);

await cp(`${source}LICENSE`, `${destination}LICENSE`);
