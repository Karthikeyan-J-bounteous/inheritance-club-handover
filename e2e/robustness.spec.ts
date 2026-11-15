import { expect, test, type Page } from "@playwright/test";

// Phase 18: what a judge does without being asked. Odd URLs, pages opened signed out, a refresh
// in the middle of things, and the same button pressed twice. Nothing may crash, hang or be
// recorded twice.
const local = !process.env.E2E_BASE_URL;

const PAGES = ["/", "/import", "/ledger", "/check", "/messages", "/review", "/handover", "/handover/notes"];
const RANDOM_ID = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const CRASH = /Application error|Unhandled Runtime Error|Internal Server Error|This page could not be found\.$/;

async function expectCalm(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status() ?? 0, path).toBeLessThan(500);
  await expect(page.locator("main").first(), path).toBeVisible();
  await expect(page.locator("body"), path).not.toContainText(CRASH);
}

async function signInAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await expect(page).toHaveURL("/");
}

async function switchTo(page: Page, who: "Arun" | "Dr. Meena" | "Kavya") {
  await page.getByRole("button", { name: /Switch demo role/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(who.replace(".", "\\.")) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`Signed in as ${who.replace(".", "\\.")}`) })).toBeVisible({ timeout: 20_000 });
}

test.describe("robustness", () => {
  test("signed out, every page asks you to sign in instead of failing", async ({ page }) => {
    for (const path of [...PAGES.slice(1), "/review/versions/1", `/ledger/evidence/${RANDOM_ID}`, `/handover/notes/${RANDOM_ID}`]) {
      await expectCalm(page, path);
      await expect(page.getByText(/sign in/i).first(), path).toBeVisible();
    }
  });

  test("odd addresses are explained, never a crash", async ({ page }) => {
    await signInAs(page, "Arun");
    const odd: [string, RegExp][] = [
      ["/review/versions/abc", /not a version number/],
      ["/review/versions/0", /not a version number/],
      ["/review/versions/99999", /no version 99999/],
      ["/ledger/evidence/not-an-id", /That quote does not exist/],
      [`/ledger/evidence/${RANDOM_ID}`, /your role/],
      [`/ledger/evidence/${RANDOM_ID}?kind=context`, /your role/],
      ["/handover/notes/not-an-id", /Note not found/],
      [`/handover/notes/${RANDOM_ID}`, /Note not found/],
      ["/check?tab=nonsense", /Conflicts \(\d+\)/],
      ["/review?tab=nonsense", /Check each item/],
      ["/messages?page=-4&q=%25%27%22", /No entries match these filters/],
      ["/messages?page=abc", /Page 1 of/],
      ["/messages?page=9999", /past the end, so this is the last one/],
      ["/ledger?tab=docket", /Conflicts/],
      ["/n/nonsense", /not valid|no longer/i],
      ["/n/abc.def", /not valid|no longer/i],
    ];
    for (const [path, says] of odd) {
      await expectCalm(page, path);
      await expect(page.locator("main").first(), path).toContainText(says);
    }
  });

  test("a refresh on any page shows the same page again", async ({ page }) => {
    await signInAs(page, "Dr. Meena");
    for (const path of PAGES) {
      await expectCalm(page, path);
      const heading = await page.getByRole("heading", { level: 1 }).first().textContent();
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 }).first(), path).toHaveText(heading ?? "");
      await expect(page.locator("body"), path).not.toContainText(CRASH);
    }
  });

  test.describe("the same action twice", () => {
    test.skip(!local, "creates a demo copy and changes its data: runs against a local stack only");
    test.setTimeout(180_000);

    test("approving twice makes one version, and an answer pressed twice is taken calmly", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: "Explore a built handover" }).click();
      await expect(page).toHaveURL(/\/\?welcome=copy$/, { timeout: 60_000 });

      // Version 1 is approved and nothing has changed: the lead is told so, not offered a mark.
      await page.goto("/review?tab=draft");
      await expect(page.getByTestId("signoff-status")).toContainText("Approved as version 1. Nothing has changed since");
      await expect(page.getByRole("button", { name: "Mark ready for the advisor" })).toBeDisabled();

      // Accept one draft, mark ready.
      const card = page.getByTestId("group-draft").getByTestId("review-item").first();
      await card.getByLabel("Reason").first().fill("Checked the quote");
      await card.getByRole("button", { name: "Accept", exact: true }).click();
      await expect(page.getByTestId("review-notice")).toContainText("Accepted.");
      const signoff = page.getByTestId("signoff");
      await signoff.getByLabel("Note for the advisor").fill("One more item checked");
      await signoff.getByRole("button", { name: "Mark ready for the advisor" }).click();
      await expect(page.getByTestId("signoff-status")).toContainText("Marked ready for the advisor");

      // The advisor approves, then presses again (a double click, or the page left open).
      await switchTo(page, "Dr. Meena");
      await page.goto("/review?tab=draft");
      const approve = page.getByTestId("signoff");
      await approve.getByLabel("Reason for approving").fill("Checked");
      await approve.getByRole("button", { name: "Approve this version" }).dblclick();
      await expect(approve.getByRole("status")).toContainText("Approved.");
      await page.reload();
      await expect(page.getByTestId("signoff-status")).toContainText("Approved as version 2.");
      await expect(page.getByRole("button", { name: "Approve this version" })).toBeDisabled();
      await expect(page.getByText("This draft is already approved as version 2.")).toBeVisible();
      await page.goto("/review?tab=versions");
      await expect(page.getByRole("link", { name: /Version 3/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Version 2/ }).first()).toBeVisible();

      // The incoming lead presses Accept twice: one calm confirmation, no error.
      await switchTo(page, "Kavya");
      await page.goto("/handover");
      const item = page.getByTestId("handover-item").first();
      await item.getByRole("button", { name: "Accept" }).dblclick();
      await expect(item.getByTestId("ack-state")).toContainText("Accepted");
      await item.getByRole("button", { name: "Accept" }).click();
      await expect(item.getByTestId("ack-state")).toContainText("Accepted");
      await expect(item.getByRole("alert")).toHaveCount(0);
    });
  });
});
