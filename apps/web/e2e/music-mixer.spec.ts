import { expect, test } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 7c-1 (mixer): the setup page /munkater/keverpult stores the mixer setup of the
// church in `mixer_settings` (music.mixer.setup: leaders), demo mode, in-process Postgres.

test.describe("Keverőpult (music module)", () => {
  test("a music leader saves the setup, it stays after a reload; axe", async ({ page }) => {
    await page.goto("/");
    await switchPersona(page, "zenei");
    await page.goto("/munkater/keverpult");
    await expect(page.getByRole("heading", { name: "Keverőpult", level: 1 })).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await page.locator("#mixer-kind").selectOption("sq-midi");
    await page.getByRole("button", { name: "Mentés" }).click();
    await expect(page.getByText("Elmentve.").first()).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // The proof that it is stored: the setup is still there after a reload.
    await expect(async () => {
      await page.reload();
      await expect(page.locator("#mixer-kind")).toHaveValue("sq-midi", { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  });

  test("a volunteer does not see the setup form", async ({ page }) => {
    await page.goto("/");
    await switchPersona(page, "onkentes");
    await page.goto("/munkater/keverpult");
    await expect(page.getByRole("button", { name: "Mentés" })).toHaveCount(0);
  });
});
