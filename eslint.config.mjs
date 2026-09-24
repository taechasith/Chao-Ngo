import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      ".vinext/**",
      ".wrangler/**",
      ".playwright-cli/**",
      "cloudflare-env.d.ts",
      "dist/**",
      "coverage/**",
      "scripts/release-ux-qa.mjs",
      "node_modules/**",
      "src/shaders/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
);
