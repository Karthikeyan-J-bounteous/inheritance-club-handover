import { expect, test, type Page } from "@playwright/test";

// Round 3, improvement 1: duties nobody wrote down, in a visitor's own copy of the built year
// club. The minimum that counts as delivered: duties are detected in the built club, labelled
// Inferred with their occurrences, and placed on the calendar.
const local = !process.env.E2E_BASE_URL;

async function loadCopy(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Explore a built handover" }).click();
  await expect(page).toHaveURL(/\/\?welcome=copy$/, { timeout: 60_000 });
}

async function switchTo(page: Page, who: "Kavya") {
  await page.getByRole("button", { name: /Switch demo role/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(who) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`Signed in as ${who}`) })).toBeVisible({ timeout: 20_000 });
}

/** Today in IST, as the handover computes "Start now" and "Overdue". */
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

test.describe("inferred duties", () => {
  test.skip(!local, "creates a demo copy: runs against a local stack only");
  test.setTimeout(120_000);

  test("duties found from repetition are labelled Inferred, list the years they were done, and are on the incoming lead's calendar", async ({ page }) => {
    await loadCopy(page);

    // The ledger lists them apart from the stated duties, each with its occurrences.
    await page.goto("/ledger?tab=recurring");
    const section = page.getByTestId("inferred-duties");
    await expect(section.getByRole("heading", { name: "Duties nobody wrote down (4)" })).toBeVisible();
    await expect(section).toContainText("No record calls them duties, so they are labelled Inferred");
    const sponsorship = section.getByRole("listitem").filter({ hasText: "Send the sponsorship proposal to Brightwave Labs" }).first();
    await expect(sponsorship).toContainText("Found from repetition");
    await expect(sponsorship).toContainText("Trust: Inferred");
    await expect(sponsorship).toContainText("About once a year (inferred, not stated)");
    await expect(sponsorship).toContainText("About 21 Jan 2027; start by 10 Jan 2027");
    await expect(sponsorship).toContainText("11 days (the longest it took before)");
    await expect(sponsorship).toContainText("Nikhil (2025), Arun (2026)");
    const years = sponsorship.getByTestId("occurrence");
    await expect(years).toHaveCount(2);
    await expect(years.nth(0)).toContainText("2025: Under way from 3 Jan 2025, done 14 Jan 2025: 11 days.");
    await expect(years.nth(0)).toContainText("“Sent the sponsorship proposal to Brightwave Labs today.”");
    await expect(years.nth(1)).toContainText("2026: Under way from 10 Jan 2026, done 21 Jan 2026: 11 days.");
    // Stated duties are not repeated as inferred ones.
    await expect(section).not.toContainText(/permission letter|auditorium|registration renewal/i);
    await expect(page.getByTestId("recurring")).not.toContainText("Found from repetition");

    // Each quote opens its source message.
    await years.nth(0).getByRole("link", { name: "Open source message" }).last().click();
    await expect(page).toHaveURL(/\/ledger\/evidence\//);
    await expect(page.getByRole("main")).toContainText("Sent the sponsorship proposal to Brightwave Labs today.");
    await expect(page.getByRole("main")).toContainText("whatsapp-committee-2024-25.txt");

    // The outgoing lead is not asked who approves a duty nobody stated.
    await page.goto("/check?tab=questions");
    await expect(page.getByTestId("gap-question").filter({ hasText: "IoT basics workshop slides" })).toHaveCount(0);

    // The incoming lead finds them on the calendar of version 1, with the start-by date.
    await switchTo(page, "Kavya");
    await page.goto("/handover");
    await expect(page.getByTestId("calendar-inferred-note")).toContainText("each was done at about the same time in past years");
    const november = page.getByTestId("calendar-month").filter({ has: page.getByRole("heading", { name: "November 2026" }) });
    const slides = november.getByTestId("handover-item").filter({ hasText: "Make the IoT basics workshop slides" });
    await expect(slides).toContainText("Found from repetition");
    await expect(slides).toContainText("Trust: Inferred");
    await expect(slides).toContainText(istToday() < "2026-11-27" ? "Start now" : "Overdue");
    await expect(slides).toContainText("start by 10 Nov 2026");
    await expect(slides.getByTestId("occurrence")).toHaveCount(2);
    await expect(slides).toContainText("2025: Under way from 10 Nov 2025, done 27 Nov 2025: 17 days.");
    await expect(page.getByTestId("handover-item").filter({ hasText: "Found from repetition" })).toHaveCount(4);
  });
});
