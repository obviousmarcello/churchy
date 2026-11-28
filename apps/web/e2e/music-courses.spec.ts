import { expect, test } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 8a (courses): /munkater/kepzesek, module ws.music.courses, `music.course.manage`
// (leaders) and `music.course.edit` (the model checks), demo mode, in-process Postgres.

test.describe("Tudástér (music courses)", () => {
  test("a leader creates a course and lands in its editor; axe", async ({ page }) => {
    await page.goto("/");
    await switchPersona(page, "vezeto");
    await page.goto("/munkater/kepzesek");
    await expect(page.getByRole("heading", { name: "Tudástér" }).first()).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await page.getByRole("button", { name: "Új képzés" }).first().click();
    await page.getByLabel("Cím").fill("E2E képzés");
    await page.getByRole("button", { name: "Létrehozás" }).click();
    await expect(page).toHaveURL(/\/munkater\/kepzesek\/[0-9a-f-]{36}\/edit/);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("a volunteer cannot create or edit courses", async ({ page }) => {
    await page.goto("/");
    await switchPersona(page, "onkentes");
    await page.goto("/munkater/kepzesek");
    await expect(page.getByRole("button", { name: "Új képzés" })).toHaveCount(0);
  });
});
