import { expect, test, type Page } from "@playwright/test";

// Round 3, improvement 3: counterparty handoff notes, in a visitor's own copy of the built year
// club (version 1 is approved when the copy is made). The minimum that counts as delivered: one
// note goes from draft to approved, is opened and acknowledged, and the acknowledgement shows on
// the handover.
const local = !process.env.E2E_BASE_URL;

// Restricted text in the year club: finance (the reimbursement) and the advisor's private chat.
const RESTRICTED = ["2,400", "Ganesan", "condonation"];

async function loadCopy(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Explore a built handover" }).click();
  await expect(page).toHaveURL(/\/\?welcome=copy$/, { timeout: 60_000 });
}

async function switchTo(page: Page, who: "Kavya" | "Arun") {
  await page.getByRole("button", { name: /Switch demo role/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(who) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`Signed in as ${who}`) })).toBeVisible({ timeout: 20_000 });
}

test.describe("counterparty notes", () => {
  test.skip(!local, "creates a demo copy and changes its data: runs against a local stack only");
  test.setTimeout(180_000);

  test("a note to the sponsor goes from draft to approved, is opened from its signed link and acknowledged, and the handover shows it", async ({ page, browser }) => {
    await loadCopy(page);

    // The home page offers a note beside the outgoing lead's other work.
    await page.getByTestId("next-step").getByRole("link", { name: "Write a note to someone outside the club" }).click();
    await expect(page).toHaveURL(/\/handover\/notes$/);
    await expect(page.getByTestId("notes-summary")).toContainText("0 notes approved, 0 acknowledged");
    const parties = page.getByTestId("note-party");
    // Finance and private counterparties are never offered.
    for (const r of RESTRICTED) await expect(page.getByRole("main")).not.toContainText(r);
    const sponsor = parties.filter({ hasText: "Brightwave Labs" });
    await expect(sponsor).toContainText("No note yet");
    await sponsor.getByRole("button", { name: "Draft a note to Brightwave Labs" }).click();
    await expect(page).toHaveURL(/\/handover\/notes\/[0-9a-f-]{36}$/);

    // The preview is the note they will read: built from the approved items, Kavya as the contact.
    const preview = page.getByTestId("note-document");
    await expect(preview).toContainText("Dear Brightwave Labs,");
    await expect(preview).toContainText("From now on, your contact at the club is Kavya.");
    // The proposal's chat promise and its Trello card are one item, said once.
    await expect(preview.getByTestId("note-section-done")).toContainText("Send the sponsorship proposal");
    await expect(preview).not.toContainText("deck v3");

    // Unsaved changes must be saved before approving, so what is approved is what was previewed.
    await page.getByLabel(/How to reach them/).fill("kavya.iot@example.edu");
    await page.getByLabel(/A short message in your own words/).fill("Thank you for backing IoT Fest. Kavya will be in touch about next year.");
    await expect(preview).toContainText("You can reach them at kavya.iot@example.edu.");
    await expect(page.getByTestId("approve-blocked")).toContainText("Save your changes first");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();

    await page.getByRole("button", { name: "Approve the note" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, approve it" }).click();
    await expect(page).toHaveURL(/\?approved=1$/);
    await expect(page.getByTestId("note-approved")).toBeVisible();
    // Approved notes cannot be edited.
    await expect(page.getByTestId("note-editor")).toHaveCount(0);
    const link = await page.getByTestId("note-link").getByRole("textbox").inputValue();
    expect(link).toMatch(/\/n\/[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);

    // The sponsor opens it with no account, in a browser of their own.
    const outside = await browser.newContext();
    const theirs = await outside.newPage();
    await theirs.goto(link);
    await expect(theirs.getByRole("heading", { name: "A note for Brightwave Labs" })).toBeVisible();
    await expect(theirs.getByRole("button", { name: /Switch demo role|Sign in/ })).toHaveCount(0);
    await expect(theirs.getByTestId("note-message")).toContainText("Thank you for backing IoT Fest.");
    const html = await theirs.content();
    for (const r of RESTRICTED) expect(html, r).not.toContain(r);
    await theirs.getByLabel(/Your name/).fill("Ms. Rao");
    await theirs.getByRole("button", { name: "I have read this note" }).click();
    await expect(theirs.getByTestId("note-acknowledged")).toContainText("Acknowledged by Ms. Rao");
    // Refreshing, or pressing again, changes nothing.
    await theirs.reload();
    await expect(theirs.getByTestId("note-acknowledged")).toContainText("Acknowledged by Ms. Rao");
    await expect(theirs.getByRole("button", { name: "I have read this note" })).toHaveCount(0);
    // An edited link opens nothing.
    await theirs.goto(link.replace(/.$/, (c) => (c === "A" ? "B" : "A")));
    await expect(theirs.getByTestId("note-invalid")).toBeVisible();
    await outside.close();

    // Back with the club: the acknowledgement is on the handover, for Arun and for Kavya.
    await page.goto("/handover");
    const onHandover = page.getByTestId("handover-note").filter({ hasText: "Brightwave Labs" });
    await expect(onHandover.getByTestId("handover-note-ack")).toContainText("Acknowledged by Ms. Rao");
    await page.goto("/review?tab=history");
    await expect(page.getByTestId("history-row").filter({ hasText: "A note was acknowledged" })).toContainText("Someone outside the club, from the signed link");
    await expect(page.getByTestId("history-row").filter({ hasText: "Approved a note to someone outside the club" })).toHaveCount(1);

    await switchTo(page, "Kavya");
    await page.goto("/handover");
    const section = page.getByTestId("handover-notes-section");
    await expect(section).toContainText("you are their contact now");
    await expect(section.getByTestId("handover-note").filter({ hasText: "Brightwave Labs" })).toContainText("Acknowledged by Ms. Rao");
    await section.getByRole("link", { name: "Read the note" }).click();
    await expect(page.getByTestId("note-document")).toContainText("Dear Brightwave Labs,");
    // Kavya reads it, but cannot change it or get its link.
    await expect(page.getByTestId("note-link")).toHaveCount(0);
    await expect(page.getByTestId("note-editor")).toHaveCount(0);
  });
});
