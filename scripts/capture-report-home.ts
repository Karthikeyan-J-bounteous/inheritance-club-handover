// Retake docs/report/home.png for the Round 3 product document: Arun's home page in a fresh demo
// copy, at the size the picture has always had (1200 x 860 CSS pixels, saved at 2x = 2400 x 1720).
// It makes one synthetic demo copy on the site you point it at (kept 7 days, then deleted) and
// calls no model.
//   node scripts/capture-report-home.ts                       # the live site
//   node scripts/capture-report-home.ts http://localhost:3200 # a local run
//   node scripts/capture-report-home.ts <base-url> <output.png>
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const [baseArg, outArg] = process.argv.slice(2);
const base = (baseArg ?? "https://inheritance.karthikeyanj.com").replace(/\/$/, "");
const out = resolve(outArg ?? "docs/report/home.png");

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 860 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  await page.goto(`${base}/login`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Explore a built handover" }).click();
  await page.waitForURL(/[?&]welcome=copy/, { timeout: 90_000 });

  // The note and the next-step card stream in after the shell; wait for both, then for the
  // entrance animation to finish, so the picture is not caught half-faded.
  await page.getByTestId("welcome-banner").waitFor({ timeout: 30_000 });
  await page.getByTestId("progress-count").waitFor({ timeout: 30_000 });
  await page.getByRole("heading", { name: "Hello, Arun" }).waitFor();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: out, animations: "disabled" });
  console.log(`Wrote ${out} from ${base}`);
} finally {
  await browser.close();
}
