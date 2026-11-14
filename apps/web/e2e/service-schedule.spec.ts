import { expect, test, type Page } from "@playwright/test";
import { CHURCHES, axeSeriousOrCritical, switchContext } from "./demo-helpers";

/**
 * D-11 service schedule page (SDD §7.2) on the demo data. Each test has its own demo session and
 * starts as the visitor in the Catholic parish, which has 3 locations (templom, kápolna, filia).
 * The demo exceptions are relative to today: next week a cancellation (*Elmarad*), in two weeks a
 * time change (*Változás*), last Sunday an extra service at the chapel (*Rendkívüli*).
 */

const PATH = "/miserend";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const weekHeading = (page: Page) => page.getByTestId("schedule-week-heading");
const filters = (page: Page) => page.getByTestId("schedule-filters");
const weekNav = (page: Page) =>
  filters(page).getByRole("navigation", { name: "Hetek közötti lapozás" });
const locationNav = (page: Page) => filters(page).getByRole("navigation", { name: "Helyszín" });
const days = (page: Page) => page.getByTestId("schedule-days");

/** The header's main navigation; opens the mobile disclosure menu first when needed. */
async function mainNav(page: Page) {
  const toggle = page.getByRole("button", { name: "Menü megnyitása" });
  if (await toggle.isVisible()) await toggle.click();
  return page.getByRole("navigation", { name: "Főmenü" });
}

function isMonday(iso: string): boolean {
  return new Date(`${iso}T12:00:00Z`).getUTCDay() === 1;
}

async function goToWeek(page: Page, which: "Előző hét" | "Következő hét") {
  await weekNav(page).getByRole("link", { name: which }).click();
  await expect(page).toHaveURL(/datum=\d{4}-\d{2}-\d{2}/);
}

/** Number of pages of a PDF made by Chromium (its page objects, `/Type /Page`). */
function pdfPageCount(pdf: Buffer): number {
  return pdf.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
}

test.describe("service schedule page", () => {
  test("is in the public main navigation and only reachable at the term slug", async ({ page }) => {
    await page.goto("/");
    await expect((await mainNav(page)).getByRole("link", { name: "Miserend" })).toHaveAttribute(
      "href",
      PATH,
    );

    await page.goto(PATH);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Miserend");
    await expect((await mainNav(page)).getByRole("link", { name: "Miserend" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // The internal route behind the rewrite is not a second public URL.
    const internal = await page.goto("/term/service-schedule");
    expect(internal?.status()).toBe(404);
  });

  test("week navigation, date picker and location filter; the URL is shareable", async ({
    page,
    browser,
  }) => {
    await page.goto(PATH);
    const thisWeek = (await weekHeading(page).textContent()) ?? "";
    expect(thisWeek).toMatch(/^A hét alkalmai: \d{4}\. /);
    await expect(weekNav(page).getByRole("link", { name: "Ez a hét" })).toHaveAttribute(
      "aria-current",
      "date",
    );
    // Today is highlighted.
    await expect(days(page).locator('[aria-current="date"]')).toHaveCount(1);

    await goToWeek(page, "Következő hét");
    const next = new URL(page.url()).searchParams.get("datum")!;
    expect(next).toMatch(ISO_DATE);
    expect(isMonday(next)).toBe(true);
    await expect(weekHeading(page)).not.toHaveText(thisWeek);
    await expect(days(page).locator("> li")).toHaveCount(7);
    await expect(days(page).locator("> li").first()).toHaveAttribute("data-date", next);

    await goToWeek(page, "Előző hét");
    await expect(weekHeading(page)).toHaveText(thisWeek);
    await weekNav(page).getByRole("link", { name: "Ez a hét" }).click();
    await expect(page).toHaveURL(new RegExp(`${PATH}$`));

    // Date field (Hungarian format) → canonical shareable URL.
    const form = page.getByTestId("schedule-date-form");
    await form.getByLabel("Ugrás egy napra").fill("2026. 12. 24.");
    await form.getByRole("button", { name: "Megjelenítés" }).click();
    await expect(page).toHaveURL(new RegExp(`${PATH}\\?datum=2026-12-24$`));
    await expect(weekHeading(page)).toHaveText("A hét alkalmai: 2026. dec. 21–27.");
    await expect(days(page).locator('[data-date="2026-12-24"]')).toContainText(
      "Csütörtök, dec. 24.",
    );

    // Location filter keeps the week.
    await locationNav(page).getByRole("link", { name: "Szent Cirill-kápolna" }).click();
    await expect(page).toHaveURL(
      new RegExp(`${PATH}\\?datum=2026-12-21&hely=szent-cirill-kapolna$`),
    );
    const chip = locationNav(page).getByRole("link", { name: "Szent Cirill-kápolna" });
    await expect(chip).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("schedule-regular").locator("[data-location]")).toHaveCount(1);
    await expect(days(page)).not.toContainText("Szent Tivadar-templom");

    // Week navigation keeps the location.
    await goToWeek(page, "Következő hét");
    await expect(page).toHaveURL(/datum=2026-12-28&hely=szent-cirill-kapolna/);

    // Shareable: the same URL in a fresh browser shows the same state.
    const shared = page.url();
    const other = await browser.newContext();
    const visitor = await other.newPage();
    await visitor.goto(shared);
    await expect(weekHeading(visitor)).toHaveText("A hét alkalmai: 2026. dec. 28. – 2027. jan. 3.");
    await expect(
      locationNav(visitor).getByRole("link", { name: "Szent Cirill-kápolna" }),
    ).toHaveAttribute("aria-current", "page");
    await other.close();

    // "Mind" removes the filter.
    await locationNav(page).getByRole("link", { name: "Mind" }).click();
    await expect(page).toHaveURL(/\?datum=2026-12-28$/);
  });

  test("an unreadable date shows an error and the current week", async ({ page }) => {
    await page.goto(`${PATH}?datum=holnap`);
    const field = page.getByLabel("Ugrás egy napra");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveValue("holnap");
    await expect(
      page.getByText("Ezt a dátumot nem tudtuk értelmezni.", { exact: false }),
    ).toBeVisible();
    await expect(days(page).locator('[aria-current="date"]')).toHaveCount(1);
  });

  test("exception, service type and language badges (demo data)", async ({ page }) => {
    await page.goto(PATH);
    await expect(days(page).getByText("Szentmise", { exact: true }).first()).toBeVisible();
    await expect(days(page).locator('[data-badge="language"]').first()).toHaveText("Német nyelvű");

    await goToWeek(page, "Következő hét");
    const cancelled = days(page).locator('[data-service-status="cancelled"]').first();
    await expect(cancelled.locator('[data-badge="exception"]')).toHaveText("Elmarad");
    await expect(cancelled.locator("s time")).toBeVisible();

    await goToWeek(page, "Következő hét");
    const modified = days(page).locator('[data-service-status="modified"]').first();
    await expect(modified.locator('[data-badge="exception"]')).toHaveText("Változás");
    await expect(modified).toContainText("eredetileg 10:00");

    await page.goto(PATH);
    await goToWeek(page, "Előző hét");
    const added = days(page).locator('[data-service-status="added"]').first();
    await expect(added.locator('[data-badge="exception"]')).toHaveText("Rendkívüli");
    await expect(added).toContainText("Kápolnabúcsú");
  });

  test("regular schedule per location and period with validity", async ({ page }) => {
    await page.goto(PATH);
    const regular = page.getByTestId("schedule-regular");
    await expect(regular.getByRole("heading", { level: 2 })).toHaveText("Általános miserend");
    await expect(regular.locator("[data-location]")).toHaveCount(3);
    const church = regular.locator('[data-location="szent-tivadar-templom"]');
    await expect(church.getByRole("heading", { name: "Rendes miserend" })).toBeVisible();
    await expect(church.getByRole("heading", { name: "Nyári miserend" })).toBeVisible();
    await expect(church.getByTestId("schedule-validity")).toHaveText([
      "Egész évben érvényes",
      "Érvényes minden évben: június 15. – augusztus 31.",
    ]);
    await expect(church.getByText("Jelenleg érvényes")).toHaveCount(1);
    await expect(
      church.getByRole("table", { name: "Szent Tivadar-templom: Rendes miserend" }),
    ).toContainText("Családi szentmise, a hónap első vasárnapján");
    await expect(
      regular.locator('[data-location="felsoligeti-szent-kelemen-templom"]'),
    ).toContainText("Szentmise, német nyelvű");
  });

  test("works on the 3 demo churches", async ({ page }) => {
    await page.goto(PATH);
    for (const church of [CHURCHES.reformed, CHURCHES.baptist, CHURCHES.catholic]) {
      await switchContext(page, church);
      await page.goto(PATH);
      await expect(page.getByTestId("schedule-church")).toHaveText(church);
      await expect(days(page).locator("> li")).toHaveCount(7);
      await expect(page.getByTestId("schedule-regular").locator("[data-location]")).not.toHaveCount(
        0,
      );
    }
  });

  test("print: one week of the 3-location parish fits on one A4 page", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "page.pdf() runs once, in desktop Chromium");
    await page.goto(PATH);
    await expect(locationNav(page).getByRole("link")).toHaveCount(4); // Mind + 3 locations

    // The counter works: the screen layout (filters, regular table) needs several pages.
    await page.emulateMedia({ media: "screen" });
    expect(pdfPageCount(await page.pdf({ format: "A4" }))).toBeGreaterThan(1);

    await page.emulateMedia({ media: "print" });
    await expect(filters(page)).toBeHidden();
    await expect(page.getByTestId("schedule-regular")).toBeHidden();
    await expect(page.locator("header")).toBeHidden();
    await expect(days(page)).toBeVisible();

    // This week and the two exception-heavy weeks after it.
    for (let i = 0; i < 3; i++) {
      const pdf = await page.pdf({ format: "A4" });
      expect(pdfPageCount(pdf), page.url()).toBe(1);
      await page.emulateMedia({ media: "screen" });
      await goToWeek(page, "Következő hét");
      await page.emulateMedia({ media: "print" });
    }
  });

  test("axe: 0 serious/critical violations", async ({ page }) => {
    for (const url of [
      PATH,
      `${PATH}?datum=2026-12-24&hely=szent-cirill-kapolna`,
      `${PATH}?datum=holnap`,
    ]) {
      await page.goto(url);
      expect(await axeSeriousOrCritical(page), url).toEqual([]);
    }
    await goToWeek(page, "Következő hét");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });
});

test.describe("service schedule without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("weeks, date field and location filter work as links and a GET form", async ({ page }) => {
    await page.goto(PATH);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Miserend");
    const thisWeek = (await weekHeading(page).textContent()) ?? "";

    await goToWeek(page, "Következő hét");
    await expect(weekHeading(page)).not.toHaveText(thisWeek);
    await expect(days(page).locator('[data-badge="exception"]').first()).toBeVisible();
    await goToWeek(page, "Előző hét");
    await expect(weekHeading(page)).toHaveText(thisWeek);

    const form = page.getByTestId("schedule-date-form");
    await form.getByLabel("Ugrás egy napra").fill("2027. 1. 6.");
    await form.getByRole("button", { name: "Megjelenítés" }).click();
    await expect(page).toHaveURL(new RegExp(`${PATH}\\?datum=2027-01-06$`));
    await expect(weekHeading(page)).toHaveText("A hét alkalmai: 2027. jan. 4–10.");

    await locationNav(page)
      .getByRole("link", { name: "Felsőligeti Szent Kelemen-templom" })
      .click();
    await expect(page).toHaveURL(/datum=2027-01-04&hely=felsoligeti-szent-kelemen-templom$/);
    await expect(page.getByTestId("schedule-regular").locator("[data-location]")).toHaveCount(1);

    // The date form keeps the location filter.
    await form.getByLabel("Ugrás egy napra").fill("2027-02-01");
    await form.getByRole("button", { name: "Megjelenítés" }).click();
    await expect(page).toHaveURL(/datum=2027-02-01&hely=felsoligeti-szent-kelemen-templom$/);
  });
});
