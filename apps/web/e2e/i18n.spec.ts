import { expect, test } from "@playwright/test";

const SHOWCASE = "/fejlesztes/komponensek";

test.describe("message catalog, Hungarian formats and terminology", () => {
  test("renders Hungarian formats through the display components", async ({ page }) => {
    await page.goto(SHOWCASE);
    const list = page.getByTestId("showcase-formatting");
    await list.scrollIntoViewIfNeeded();
    for (const text of [
      "2026. november 12., csütörtök",
      "2026. 11. 12.",
      "nov. 9–15.",
      "Holnap",
      "18:00–19:30",
      "18 óra 30 perc",
      "dr. Minta Katalin",
      "1056 Budapest, Március 15. tér 3.",
      "+36 30 123 4567",
      "11773016-11111018-00000000",
      "HU42 1177 3016 1111 1018 0000 0000",
    ]) {
      await expect(list.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(list.getByRole("link", { name: "+36 30 123 4567" })).toHaveAttribute(
      "href",
      "tel:+36301234567",
    );
  });

  test("message placeholders are filled from the tenant's terminology (rk demo)", async ({
    page,
  }) => {
    await page.goto(SHOWCASE);
    const live = page.getByTestId("showcase-terms-live");
    await expect(live).toContainText("Következő szentmisék");
    await expect(live).toContainText("Üdvözöljük a plébánia oldalán!");
    await expect(live).not.toContainText("{");
  });

  test("a Reformed church gets its own words and the right article", async ({ page }) => {
    await page.goto(SHOWCASE);
    const row = page
      .getByTestId("showcase-terms")
      .getByRole("listitem")
      .filter({ hasText: "Református" });
    await expect(row).toContainText("Istentiszteleti rend");
    await expect(row).toContainText("Lelkipásztor");
    await expect(row).not.toContainText("mise");
  });
});
