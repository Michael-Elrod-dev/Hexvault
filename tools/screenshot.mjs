/**
 * Render the UI to PNGs using the installed Edge, without building Rust.
 *
 * Start the dev server first (`npm run dev`), then `npm run shot`. The frontend
 * falls back to mock data outside Tauri (see src/mock.ts), so this shows the
 * real layout with placeholder content.
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const EDGE =
  process.env.EDGE_PATH ??
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = process.env.SHOT_URL ?? "http://localhost:1420/";
const OUT = process.argv[2] ?? "screenshots";

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--force-color-profile=srgb"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const click = (label) =>
  page.evaluate((text) => {
    const match = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(text),
    );
    match?.click();
  }, label);

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

await page.setViewport({ width: 520, height: 900 });
await page.goto(URL, { waitUntil: "networkidle0" });
await settle(800);
await page.screenshot({ path: `${OUT}/01-accounts.png` });

await click("Edit");
await settle();
await page.screenshot({ path: `${OUT}/02-edit-mode.png` });
await click("Edit");

await click("Show Passwords");
await settle();
await page.screenshot({ path: `${OUT}/03-passwords.png` });
await click("Hide Passwords");

await click("Champions");
await settle(400);
await page.screenshot({ path: `${OUT}/04-champions.png` });

await page.setViewport({ width: 900, height: 900 });
await settle(400);
await page.screenshot({ path: `${OUT}/05-champions-wide.png` });

await page.setViewport({ width: 520, height: 900 });
await click("Accounts");
await settle();
await click("+ Add");
await settle(350);
await page.screenshot({ path: `${OUT}/06-dialog.png` });

console.log(errors.length ? `page errors: ${errors.join("; ")}` : "no page errors");
console.log(`wrote 6 screenshots to ${OUT}/`);
await browser.close();
