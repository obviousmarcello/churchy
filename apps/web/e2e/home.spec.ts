import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { CHURCHES, axeSeriousOrCritical, switchContext } from "./demo-helpers";

/**
 * D-10 [UI]: the public home page — sections in configured order, "next services" with
 * *Ma / Holnap* labels (moved across midnight with the demo-only clock cookie), the block within
 * one screen below the hero at 360 × 740, structured data, axe.
 */
const ORDER = ["nextServices", "announcements", "news", "events", "map"];
const FLOW = [CHURCHES.catholic, CHURCHES.reformed, CHURCHES.baptist] as const;

const sections = (page: Page) =>
  page
    .locator("[data-home-section]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-home-section")));

async function travelTo(page: Page, context: BrowserContext, at: Date) {
  await context.addCookies([
    { name: "churchy_demo_now", value: at.toISOString(), url: `${new URL(page.url()).origin}/` },
  ]);
}

/** Budapest civil date of an instant. */
const budapestDate = (at: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(at);

test.describe("home page", () => {
  test("renders the configured sections in order on the 3 demo churches", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    for (const church of FLOW) {
      await switchContext(page, church);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: church }), church).toBeVisible();
      expect(await sections(page), church).toEqual(ORDER);
      await expect(page.getByTestId("next-services"), church).toBeVisible();
      await expect(page.locator('script[type="application/ld+json"]'), church).toHaveCount(1);
      expect(await axeSeriousOrCritical(page), church).toEqual([]);
    }
  });

  test("terminology follows the church: no szentmise outside the Catholic parish", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("next-services").getByRole("heading", { level: 2 })).toHaveText(
      /szentmis/i,
    );
    await switchContext(page, CHURCHES.reformed);
    await page.goto("/");
    const text = (await page.getByTestId("next-services").innerText()).toLowerCase();
    expect(text).not.toContain("szentmise");
    await expect(page.getByTestId("next-services-all")).toContainText(
      "Teljes istentiszteleti rend",
    );
  });

  test("Ma / Holnap labels move across midnight without any data change", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    const before = new Date();
    // Just before and just after the next Budapest midnight.
    const today = budapestDate(before);
    const tomorrow = budapestDate(new Date(before.getTime() + 86_400_000));
    const midnight = new Date(`${tomorrow}T00:00:00+01:00`).getTime();
    // Budapest midnight is 23:00 or 22:00 UTC the day before; find it exactly.
    let edge = midnight - 3_600_000;
    while (budapestDate(new Date(edge)) !== tomorrow) edge += 60_000;

    await travelTo(page, context, new Date(edge - 30 * 60_000));
    await page.goto("/");
    const days = page.getByTestId("next-services-day");
    const first = await days.first().getAttribute("data-date");
    if (first === today) {
      await expect(days.first().getByRole("heading")).toHaveText("Ma");
    }

    await travelTo(page, context, new Date(edge + 30 * 60_000));
    await page.goto("/");
    const dates = await days.evaluateAll((els) => els.map((el) => el.getAttribute("data-date")));
    expect(dates).not.toContain(today);
    expect(dates[0]! >= tomorrow).toBe(true);
    if (dates[0] === tomorrow) {
      await expect(days.first().getByRole("heading")).toHaveText("Ma");
    }
  });
});

test.describe("home page at 360 × 740", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("the next-services block is fully visible within one screen below the hero", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    for (const church of FLOW) {
      await switchContext(page, church);
      await page.goto("/");
      const box = await page.evaluate(() => {
        const hero = document.querySelector("[data-hero]")!.getBoundingClientRect();
        const card = document
          .querySelector('[data-testid="next-services"]')!
          .getBoundingClientRect();
        return {
          heroBottom: hero.bottom + scrollY,
          top: card.top + scrollY,
          bottom: card.bottom + scrollY,
        };
      });
      // Scrolled so that the hero's bottom edge is at the top of the screen, the block fits.
      expect(box.bottom - box.heroBottom, church).toBeLessThanOrEqual(740);
      expect(box.top, church).toBeGreaterThanOrEqual(box.heroBottom);
      // No horizontal scroll.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        church,
      ).toBeLessThanOrEqual(360);
    }
  });
});
