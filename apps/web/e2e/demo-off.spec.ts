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
    // The main menu holds only public items (Kapcsolat, D-12), never an app area.
    const nav = page.getByRole("navigation", { name: "Főmenü" });
    await expect(nav.getByRole("link", { name: "Kapcsolat" })).toBeAttached();
    for (const area of ["Munkatér", "Weboldal kezelése", "Egyházmegyei portál"]) {
      await expect(nav.getByRole("link", { name: area })).toHaveCount(0);
    }
  });

  test("dev and demo tools are not served by a production server without demo mode", async ({
    request,
  }) => {
    for (const path of ["/fejlesztes/kimeno-levelek", "/fejlesztes/komponensek"]) {
      expect((await request.get(`${NO_DEMO}${path}`)).status(), path).toBe(404);
    }
  });
});
