import { expect, test } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 7c-2 (rehearsal): /munkater/proba builds a setlist in the browser (a draft in
// localStorage) and `/munkater/vetites?rehearsal` projects it, in one browser, without an event.

test.describe("Próba (music module)", () => {
  test("a setlist is built, stays after a reload and is projected; axe", async ({ page }) => {
    await page.goto("/");
    await switchPersona(page, "zenei");
    await page.goto("/munkater/proba");
    await expect(page.getByRole("heading", { name: "Dallista" })).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await page
      .getByRole("button", { name: /hozzáadása a dallistához/ })
      .first()
      .click();
    await expect(page.getByText("A dallistád üres")).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("A dallistád üres")).toHaveCount(0);
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Save the setlist as a new event (music.event.manage): the page opens the new event.
    await page.getByRole("button", { name: "Mentés eseményhez" }).click();
    const dialog = page.getByRole("dialog");
    // The demo church has no event yet, so the dialog opens on the form of a new event.
    await dialog.getByRole("textbox", { name: "Kezdés" }).fill("2031-03-02T18:00");
    await dialog.getByRole("button", { name: "Esemény létrehozása a dallistával" }).click();
    await expect(page).toHaveURL(/\/munkater\/esemenyek\/[0-9a-f-]{36}/, { timeout: 15_000 });

    await page.goto("/munkater/vetites?rehearsal");
    await expect(page.getByText("A próba dallistád üres")).toHaveCount(0);
    await expect(page.locator("main, body").first()).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("a volunteer reaches the page but has no save panel", async ({ page }) => {
    await page.goto("/");
    await switchPersona(page, "onkentes");
    await page.goto("/munkater/proba");
    await expect(page.getByRole("heading", { name: "Dallista" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mentés eseményhez/ })).toHaveCount(0);
  });
});
