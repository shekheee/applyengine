#!/usr/bin/env node
/** Generate signature resume on production, screenshot, verify PDF */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const API = "https://applyengine-api.onrender.com";
const OUT = "/tmp/signature-verify";

fs.mkdirSync(OUT, { recursive: true });

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "neontest@applyengine.local", password: "123456789" }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return (await res.json()).access_token;
}

async function main() {
  const token = await login();
  console.log("Generating signature style…");
  const gen = await fetch(`${API}/api/resume/design?style=signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!gen.ok) throw new Error(`design: ${gen.status} ${await gen.text()}`);
  const design = await gen.json();
  console.log("version:", design.version_id);

  const ver = await fetch(`${API}/api/resume/versions/${design.version_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const html = ver.html_content || "";
  const htmlPath = path.join(OUT, "signature.html");
  fs.writeFileSync(htmlPath, html);
  console.log("has signature class:", html.includes('class="page signature"'));

  const pdfRes = await fetch(`${API}/api/resume/pdf?version_id=${design.version_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  fs.writeFileSync(path.join(OUT, "signature.pdf"), pdfBuf);
  console.log(
    "PDF:",
    pdfRes.headers.get("x-pdf-engine"),
    "pages:",
    pdfRes.headers.get("x-pdf-pages"),
    "bytes:",
    pdfBuf.length
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "signature-result.png"), fullPage: true });
  await browser.close();
  console.log("Saved:", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
