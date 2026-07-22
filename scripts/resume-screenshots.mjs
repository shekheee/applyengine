#!/usr/bin/env node
/**
 * Login to ApplyEngine, generate each resume style, screenshot iframe preview.
 * Usage: node scripts/resume-screenshots.mjs [--out /tmp/resume-after] [--base https://applyengine.ajayshekhawat.uk]
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://applyengine.ajayshekhawat.uk";
const OUT = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "/tmp/resume-after";
const STYLES = ["editorial", "executive", "minimal"];
const EMAIL = "neontest@applyengine.local";
const PASS = "123456789";

fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log("Login…", BASE);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60000 });

  await page.goto(`${BASE}/resume`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(2000);

  for (const style of STYLES) {
    console.log(`Style: ${style}`);
    const styleBtn = page.locator(`button[role="radio"]`).filter({ hasText: /editorial|sidebar|minimal/i });
    const labels = {
      editorial: /Modern editorial/i,
      executive: /Teal sidebar/i,
      minimal: /Refined minimal/i,
    };
    await page.locator("button[role='radio']").filter({ hasText: labels[style] }).click();
    await page.waitForTimeout(400);

    const genBtn = page.getByRole("button", { name: /Generate designed resume|Generate for this role/i });
    await genBtn.click();

    await page.waitForFunction(
      () => {
        const btn = [...document.querySelectorAll("button")].find((b) =>
          /New version saved|preview updated/i.test(b.textContent || "")
        );
        return !!btn;
      },
      { timeout: 180000 }
    );
    await page.waitForTimeout(2500);

    const iframe = page.frameLocator('iframe[title*="Resume"], iframe[title*="resume"], iframe').first();
    await iframe.locator("body").waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);

    const iframeEl = page.locator('iframe[title*="Resume"], iframe[title*="resume"], iframe').first();
    await iframeEl.screenshot({ path: path.join(OUT, `${style}-iframe.png`) });
    await page.screenshot({ path: path.join(OUT, `${style}-page.png`), fullPage: false });
    console.log(`  saved ${style}-iframe.png`);
  }

  await browser.close();
  console.log("Done:", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
