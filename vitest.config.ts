import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "cloudflare:workers": fileURLToPath(new URL("./lib/server/testing/cloudflare.ts", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
