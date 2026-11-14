import { expect, test, type Page } from "@playwright/test";
import { CHURCHES, switchContext } from "./demo-helpers";

/**
 * Terminology and site config follow the church chosen in the demo switcher (MP1: works on the
 * 3 demo churches). The church comes from `getRequestContext()`; its denomination preset, term
 * overrides, name and theme from `tenants.current`. Each test has its own demo session and starts
 * in the Catholic parish.
 */

/** The header's main navigation; opens the mobile disclosure menu first when needed. */
async function mainNav(page: Page) {
  const toggle = page.getByRole("button", { name: "Menü megnyitása" });
  if (await toggle.isVisible()) await toggle.click();
  return page.getByRole("navigation", { name: "Főmenü" });
}

const primaryColor = (page: Page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue("--c-primary"));

const PROTESTANT = [
  {
    church: CHURCHES.reformed,
    schedule: "Istentiszteleti rend",
    path: "/istentiszteleti-rend",
    regular: "Általános istentiszteleti rend",
    office: "Lelkészi hivatal nyitvatartása",
    locations: "Templomaink",
  },
  {
    church: CHURCHES.baptist,
    schedule: "Alkalmaink",
    path: "/alkalmaink",
    regular: "Általános alkalmaink",
    office: "Gyülekezeti iroda nyitvatartása",
    locations: "Helyszíneink",
  },
] as const;

test.describe("terminology follows the demo church", () => {
  for (const expected of PROTESTANT) {
    test(`${expected.church}: nav label, slug, heading and placeholders`, async ({ page }) => {
      await page.goto("/");
      const catholicPrimary = await primaryColor(page);
      await switchContext(page, expected.church);

      // Nav label and term slug.
      const nav = await mainNav(page);
      await expect(nav.getByRole("link", { name: expected.schedule })).toHaveAttribute(
        "href",
        expected.path,
      );
      await expect(nav.getByRole("link", { name: "Miserend" })).toHaveCount(0);

      // The schedule page at the church's slug: heading, a `{serviceSchedule.lower}` placeholder.
      const response = await page.goto(expected.path);
      expect(response?.status()).toBe(200);
      await expect(page.getByTestId("schedule-church")).toHaveText(expected.church);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(expected.schedule);
      await expect(page).toHaveTitle(expected.schedule);
      await expect(
        page.getByTestId("schedule-regular").getByRole("heading", { level: 2 }),
      ).toHaveText(expected.regular);
      await expect(page.locator("main")).not.toContainText(/mise/i);
      await expect(
        (await mainNav(page)).getByRole("link", { name: expected.schedule }),
      ).toHaveAttribute("aria-current", "page");

      // The Catholic slug is not this church's page.
      expect((await page.goto("/miserend"))?.status()).toBe(404);

      // D-12 pages: `{office.nom}` and `{locationsSection.nom}` placeholders.
      await page.goto("/kapcsolat");
      await expect(page.getByRole("heading", { name: expected.office })).toBeVisible();
      await page.goto("/templomaink");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(expected.locations);

      // The church's own theme colours (seed `siteConfig.theme`).
      expect(await primaryColor(page)).not.toBe(catholicPrimary);
    });
  }

  test("the Catholic parish keeps its words and slug", async ({ page }) => {
    await page.goto("/");
    await switchContext(page, CHURCHES.baptist);
    await switchContext(page, CHURCHES.catholic);
    await expect((await mainNav(page)).getByRole("link", { name: "Miserend" })).toHaveAttribute(
      "href",
      "/miserend",
    );
    await page.goto("/miserend");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Miserend");
    await expect(
      page.getByTestId("schedule-regular").getByRole("heading", { level: 2 }),
    ).toHaveText("Általános miserend");
    for (const path of ["/istentiszteleti-rend", "/alkalmaink"]) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
    await page.goto("/kapcsolat");
    await expect(
      page.getByRole("heading", { name: "Plébániai iroda nyitvatartása" }),
    ).toBeVisible();
  });

  test("switching church on the schedule page moves to the new church's slug", async ({ page }) => {
    await page.goto("/miserend");
    await switchContext(page, CHURCHES.reformed);
    await expect(page).toHaveURL(/\/istentiszteleti-rend$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Istentiszteleti rend");
    await switchContext(page, CHURCHES.baptist);
    await expect(page).toHaveURL(/\/alkalmaink$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Alkalmaink");
    // The diocese has no public site: back to the start page.
    await switchContext(page, CHURCHES.diocese);
    await expect(page).toHaveURL(/\/$/);
  });

  test("the diocese uses neutral terms, never a denomination's", async ({ page }) => {
    await page.goto("/");
    await switchContext(page, CHURCHES.diocese);
    const nav = await mainNav(page);
    await expect(nav.getByRole("link", { name: "Miserend" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Alkalmaink" })).toHaveAttribute(
      "href",
      "/alkalmaink",
    );
  });
});
