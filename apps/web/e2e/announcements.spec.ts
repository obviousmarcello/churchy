import { expect, test, type Page } from "@playwright/test";
import { CHURCHES, axeSeriousOrCritical, switchContext } from "./demo-helpers";

/**
 * D-14 weekly announcements (SDD §7.3) on the demo data. Each test has its own demo session and
 * starts as the visitor in the Catholic parish. The demo weeks are relative to today: the coming
 * Sunday (latest, with a PDF), the four weeks before it, a draft for next week (never shown) and an
 * older Easter week (feast week, with a PDF).
 */

const PATH = "/hirdetesek";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** `Hirdetések — 2026. november 15. (Évközi 33. vasárnap)` */
const HEADING = /^Hirdetések — \d{4}\. [a-zá-ű]+ \d{1,2}\. \(.+\)$/;
/** Published demo weeks per church: four relative weeks, the latest and the Easter week. */
const PUBLISHED_WEEKS = 6;

const heading = (page: Page) => page.getByTestId("announcement-heading");
const weekNav = (page: Page) => page.getByRole("navigation", { name: "Hetek közötti lapozás" });
const archiveWeeks = (page: Page) => page.getByTestId("archive-week");

/** The header's main navigation; opens the mobile disclosure menu first when needed. */
async function mainNav(page: Page) {
  const toggle = page.getByRole("button", { name: "Menü megnyitása" });
  if (await toggle.isVisible()) await toggle.click();
  return page.getByRole("navigation", { name: "Főmenü" });
}

/** Number of pages of a PDF made by Chromium (its page objects, `/Type /Page`). */
function pdfPageCount(pdf: Buffer): number {
  return pdf.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
}

async function openEasterWeek(page: Page) {
  await page.goto(`${PATH}?nezet=archivum`);
  await archiveWeeks(page).filter({ hasText: "Húsvétvasárnap" }).getByRole("link").click();
  await expect(page).toHaveURL(/\?het=\d{4}-\d{2}-\d{2}$/);
  await expect(heading(page)).toHaveText(/\(Húsvétvasárnap\)$/);
}

test.describe("weekly announcements", () => {
  test("the latest week is one click from the home page's main navigation", async ({ page }) => {
    await page.goto("/");
    const link = (await mainNav(page)).getByRole("link", { name: "Hirdetések" });
    await expect(link).toHaveAttribute("href", PATH);
    await link.click(); // the one click (D-14 AC1)
    await expect(page).toHaveURL(new RegExp(`${PATH}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADING);
    await expect(page.getByTestId("announcement-latest")).toHaveText("Legfrissebb");
    await expect(page.getByTestId("announcement-body").locator("li").first()).toBeVisible();
    await expect((await mainNav(page)).getByRole("link", { name: "Hirdetések" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // The latest is the coming Sunday's week; next week's draft is not shown.
    await expect(weekNav(page).getByRole("link", { name: /Következő hét/ })).toHaveCount(0);

    // The internal route behind the rewrite is not a second public URL.
    const internal = await page.goto("/term/announcements");
    expect(internal?.status()).toBe(404);
  });

  test("archive navigation by week: previous / next, archive list, shareable URLs", async ({
    page,
  }) => {
    await page.goto(PATH);
    const latest = (await heading(page).textContent()) ?? "";
    const latestWeek = await page.getByTestId("announcement").getAttribute("data-week");

    await weekNav(page)
      .getByRole("link", { name: /Előző hét/ })
      .click();
    await expect(page).toHaveURL(/\?het=\d{4}-\d{2}-\d{2}$/);
    const previous = new URL(page.url()).searchParams.get("het")!;
    expect(previous).toMatch(ISO_DATE);
    expect(Date.parse(latestWeek!) - Date.parse(previous)).toBe(7 * 86_400_000);
    await expect(heading(page)).toHaveText(HEADING);
    await expect(heading(page)).not.toHaveText(latest);
    await expect(page.getByTestId("announcement-latest")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Legfrissebb hirdetések" })).toHaveAttribute(
      "href",
      PATH,
    );

    await weekNav(page)
      .getByRole("link", { name: /Következő hét/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`\\?het=${latestWeek}$`));
    await expect(heading(page)).toHaveText(latest);

    // Archive: every published week, newest first, with the liturgical names.
    await weekNav(page).getByRole("link", { name: "Archívum" }).click();
    await expect(page).toHaveURL(new RegExp(`${PATH}\\?nezet=archivum$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hirdetések – archívum");
    await expect(archiveWeeks(page)).toHaveCount(PUBLISHED_WEEKS);
    const weeks = await archiveWeeks(page).evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-week")!),
    );
    expect(weeks).toEqual([...weeks].sort().reverse());
    expect(weeks[0]).toBe(latestWeek);
    await expect(archiveWeeks(page).first()).toContainText("Legfrissebb");
    await expect(archiveWeeks(page).filter({ hasText: "PDF melléklettel" })).toHaveCount(2);

    // The feast week, from the archive; its "previous week" link skips to nothing older.
    await archiveWeeks(page).filter({ hasText: "Húsvétvasárnap" }).getByRole("link").click();
    await expect(heading(page)).toHaveText(
      /^Hirdetések — \d{4}\. (március|április) \d+\. \(Húsvétvasárnap\)$/,
    );
    await expect(weekNav(page).getByRole("link", { name: /Előző hét/ })).toHaveCount(0);
    await expect(page.getByTestId("announcement-body")).toContainText("Krisztus feltámadt!");

    // Any day of a week is redirected to its Sunday.
    const monday = new Date(Date.parse(`${previous}T12:00:00Z`) - 6 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await page.goto(`${PATH}?het=${monday}`);
    await expect(page).toHaveURL(new RegExp(`\\?het=${previous}$`));

    // A week without announcements says so and still links to its neighbours.
    await page.goto(`${PATH}?het=2020-01-05`);
    await expect(page.getByTestId("announcement-missing")).toContainText(
      "nincsenek közzétett hirdetések",
    );
    await expect(weekNav(page).getByRole("link", { name: /Következő hét/ })).toBeVisible();

    // An unreadable date shows the latest week with a notice.
    await page.goto(`${PATH}?het=holnap`);
    await expect(page.getByText("Ezt a dátumot nem tudtuk értelmezni")).toBeVisible();
    await expect(heading(page)).toHaveText(latest);
  });

  test("the PDF attachment is downloadable", async ({ page }) => {
    await page.goto(PATH);
    const attachment = page.getByTestId("announcement-attachment");
    await expect(attachment.getByRole("heading", { name: "Csatolt dokumentum" })).toBeVisible();
    await expect(attachment).toContainText("heti-hirdetesek-minta.pdf");
    await expect(attachment).toContainText(/PDF, \d+ kB/);
    const open = page.getByTestId("announcement-pdf-open");
    await expect(open).toHaveAttribute("href", "/demo/minta-dokumentum.pdf");

    const download = page.waitForEvent("download");
    await page.getByTestId("announcement-pdf-download").click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("heti-hirdetesek-minta.pdf");

    const response = await page.request.get("/demo/minta-dokumentum.pdf");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect((await response.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // Weeks without a PDF show no attachment.
    await weekNav(page)
      .getByRole("link", { name: /Előző hét/ })
      .click();
    await expect(heading(page)).toBeVisible();
    await expect(page.getByTestId("announcement-attachment")).toHaveCount(0);
  });

  test("works on the 3 demo churches, with each tradition's Sunday names", async ({ page }) => {
    await page.goto(PATH);
    for (const church of [CHURCHES.reformed, CHURCHES.baptist, CHURCHES.catholic]) {
      await switchContext(page, church);
      await page.goto("/");
      await (await mainNav(page)).getByRole("link", { name: "Hirdetések" }).click();
      await expect(page.getByTestId("announcements-church")).toHaveText(church);
      await expect(heading(page)).toHaveText(HEADING);
      await expect(page.getByTestId("announcement-body").locator("li")).not.toHaveCount(0);
      await page.goto(`${PATH}?nezet=archivum`);
      await expect(archiveWeeks(page)).toHaveCount(PUBLISHED_WEEKS);
      const names = (await archiveWeeks(page).getByRole("link").allTextContents()).join("\n");
      expect(names).toContain("Húsvétvasárnap");
      if (church === CHURCHES.catholic) expect(names).not.toContain("Szentháromság ünnepe utáni");
      else expect(names).not.toContain("Évközi");
    }
  });

  test("print view: chrome hidden, the week on a limited number of A4 pages", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "page.pdf() runs once, in desktop Chromium");
    await page.goto(PATH);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("header")).toBeHidden();
    await expect(weekNav(page)).toBeHidden();
    await expect(page.getByTestId("announcement-attachment")).toBeHidden();
    await expect(heading(page)).toBeVisible();
    await expect(page.getByTestId("announcement-body")).toBeVisible();
    expect(pdfPageCount(await page.pdf({ format: "A4" }))).toBe(1);

    // The longest demo week (Easter) still fits on one page.
    await page.emulateMedia({ media: "screen" });
    await openEasterWeek(page);
    await page.emulateMedia({ media: "print" });
    expect(pdfPageCount(await page.pdf({ format: "A4" }))).toBe(1);
  });

  test("axe: 0 serious/critical violations", async ({ page }) => {
    for (const url of [PATH, `${PATH}?nezet=archivum`, `${PATH}?het=2020-01-05`, `${PATH}?het=x`]) {
      await page.goto(url);
      expect(await axeSeriousOrCritical(page), url).toEqual([]);
    }
    await openEasterWeek(page);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });
});

test.describe("weekly announcements without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("week links and the archive work as plain links", async ({ page }) => {
    await page.goto(PATH);
    const latest = (await heading(page).textContent()) ?? "";
    await weekNav(page)
      .getByRole("link", { name: /Előző hét/ })
      .click();
    await expect(heading(page)).not.toHaveText(latest);
    await weekNav(page).getByRole("link", { name: "Archívum" }).click();
    await expect(archiveWeeks(page)).toHaveCount(PUBLISHED_WEEKS);
    await archiveWeeks(page).first().getByRole("link").click();
    await expect(heading(page)).toHaveText(latest);
  });
});
