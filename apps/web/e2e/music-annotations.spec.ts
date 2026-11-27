import { expect, test } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 5e-3: the user's own notes on a song, on the chord sheet.

test("a user adds, changes and deletes a note on the chord sheet", async ({ page }) => {
  await page.goto("/");
  await switchPersona(page, "zenei");
  await page.goto("/munkater/enektar");
  await page
    .getByRole("button", { name: /^Áldás, békesség/ })
    .first()
    .click();
  await page.getByRole("link", { name: "Akkordlap" }).first().click();
  await expect(page).toHaveURL(/\/munkater\/kotta\?arrangement=/);

  await page.getByRole("button", { name: /Jegyzeteid \(0\)/ }).click();
  await expect(page.getByText("Még nincs jegyzeted ehhez a dalhoz.")).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  await page
    .getByRole("textbox", { name: "Jegyzet", exact: true })
    .last()
    .fill("A dobok a refrénnél szállnak be");
  await page.getByRole("textbox", { name: "Szakasz (nem kötelező)" }).fill("Refrén");
  await page.getByRole("button", { name: "Jegyzet hozzáadása" }).click();
  await expect(page.getByText("A dobok a refrénnél szállnak be")).toBeVisible();
  await expect(page.getByText("Refrén", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Jegyzeteid \(1\)/ })).toBeVisible();

  // The note stays: it is the user's own and belongs to the song.
  await page.reload();
  await page.getByRole("button", { name: /Jegyzeteid \(1\)/ }).click();
  await expect(page.getByText("A dobok a refrénnél szállnak be")).toBeVisible();

  await page.getByRole("button", { name: "Jegyzet törlése" }).click();
  await expect(page.getByText("Még nincs jegyzeted ehhez a dalhoz.")).toBeVisible();
});
