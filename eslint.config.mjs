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
      "public/vendor/**",
    ],
  },
  { files: ["public/landing-pages/player-layer.js"], languageOptions: { globals: { document: "readonly", window: "readonly", Element: "readonly", MutationObserver: "readonly", requestAnimationFrame: "readonly" } } },
  js.configs.recommended,
  tseslint.configs.recommended,
);
