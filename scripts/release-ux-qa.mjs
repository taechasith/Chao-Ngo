/* eslint-env node, browser */

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3000";
const outputDir = "artifacts/release-ux-qa";
const viewports = [
  { name: "360", width: 360, height: 800, mobile: true },
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 900 },
  { name: "1440", width: 1440, height: 1000 },
];
const routes = [
  ["landing", "/"],
  ["login", "/login"],
  ["signup", "/signup"],
  ["play", "/play"],
  ["onboarding", "/onboarding"],
  ["node-zone", "/play/node-zone"],
  ["quantum", "/play/node-zone/quantum"],
  ["space", "/play/node-zone/space"],
  ["ka", "/play/ka-casefiles"],
  ["maimee", "/play/ka-casefiles/maimee"],
  ["wa-ve", "/play/ka-casefiles/wa-ve"],
  ["profile", "/profile"],
  ["settings", "/settings"],
  ["submit", "/submit"],
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: Boolean(viewport.mobile),
    hasTouch: Boolean(viewport.mobile),
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "failed"}`));

  for (const [name, route] of routes) {
    consoleErrors.length = 0;
    failedRequests.length = 0;
    try {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(350);
      if (route === "/") {
        await page.waitForFunction(() => {
          const frame = document.querySelector("iframe.player-landing-frame");
          return frame instanceof HTMLIFrameElement && frame.contentDocument?.readyState === "complete";
        }, undefined, { timeout: 15_000 });
      }
      await page.keyboard.press("Tab");
      const checks = await page.evaluate(() => {
        const root = document.documentElement;
        const focus = document.activeElement;
        const overflow = Math.max(root.scrollWidth - root.clientWidth, document.body.scrollWidth - root.clientWidth);
        const focusedStyle = focus instanceof HTMLElement ? getComputedStyle(focus) : null;
        return {
          documentTitle: document.title,
          horizontalOverflow: overflow,
          focusedTag: focus?.tagName ?? null,
          focusOutline: focusedStyle?.outlineStyle ?? null,
          focusVisible: focus instanceof HTMLElement && focus.matches(":focus-visible"),
          thaiTextPresent: /[\u0E00-\u0E7F]/.test(document.body.innerText),
        };
      });
      const screenshot = `${outputDir}/${viewport.name}-${name}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({ viewport: viewport.name, route, status: response?.status() ?? null, screenshot, consoleErrors: [...consoleErrors], failedRequests: [...failedRequests], ...checks });
    } catch (error) {
      results.push({ viewport: viewport.name, route, status: null, screenshot: null, consoleErrors: [...consoleErrors], failedRequests: [...failedRequests], error: error instanceof Error ? error.message : String(error) });
    }
  }

  await context.close();
}

await browser.close();
await writeFile(`${outputDir}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
const failures = results.filter((result) => result.status !== 200 || result.consoleErrors.length || result.failedRequests.length || result.horizontalOverflow > 1);
console.log(JSON.stringify({ checked: results.length, failures: failures.length, outputDir }, null, 2));
if (failures.length) process.exitCode = 1;
