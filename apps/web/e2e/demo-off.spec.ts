import { expect, test } from "@playwright/test";

/**
 * Runs against a third `next start` of the same build without demo mode (see playwright.config.ts):
 * no banner, no switcher, no demo cookies, anonymous visitor, dev and demo tools hidden.
 */
const NO_DEMO = `http://localhost:${process.env.NO_DEMO_PORT ?? 3102}`;

test.describe("DEMO_MODE off", () => {
  test("no banner, no switcher and no cookies", async ({ page }) => {
    const response = await page.goto(`${NO_DEMO}/`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["set-cookie"]).toBeUndefined();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("demo-banner")).toHaveCount(0);
    await expect(page.getByText("Bemutató — nem valós adatok")).toHaveCount(0);
    expect(await page.context().cookies()).toEqual([]);
  });

  test("the visitor is anonymous: no area is open", async ({ page }) => {
    await page.goto(`${NO_DEMO}/admin`);
    await expect(page.getByTestId("area-no-access")).toBeVisible();
    // The header only has the public main navigation (D-11, D-12), never an app area.
    const nav = page.locator("header nav");
    for (const area of ["/munkater", "/admin", "/egyhazmegye"]) {
      await expect(nav.locator(`a[href="${area}"]`), area).toHaveCount(0);
    }
    await expect(nav.locator('a[href="/miserend"]')).toHaveCount(1);
    await expect(nav.locator('a[href="/kapcsolat"]')).toHaveCount(1);
  });

  test("dev and demo tools are not served by a production server without demo mode", async ({
    request,
  }) => {
    for (const path of ["/fejlesztes/kimeno-levelek", "/fejlesztes/komponensek"]) {
      expect((await request.get(`${NO_DEMO}${path}`)).status(), path).toBe(404);
    }
  });
});
