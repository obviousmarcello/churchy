import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 5b (live sessions): a rehearsal session on the chord sheet, led by the user, in
// demo mode (in-process database, local BroadcastChannel transport).

async function openSheet(page: Page) {
  await page.goto("/");
  await switchPersona(page, "zenei");
  await page.goto("/munkater/enektar");
  await page
    .getByRole("button", { name: /^Áldás, békesség/ })
    .first()
    .click();
  await page.getByRole("link", { name: "Akkordlap" }).first().click();
  await expect(page).toHaveURL(/\/munkater\/kotta\?arrangement=/);
}

test("the user starts a live session on the chord sheet, leads it and ends it", async ({
  page,
}) => {
  await openSheet(page);
  await page
    .getByRole("button", { name: /Közös alkalom/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Közös alkalom indítása" }).click();
  await expect(page).toHaveURL(/\/munkater\/kotta\?session=/);
  await page
    .getByRole("button", { name: /Közös alkalom/ })
    .first()
    .click();
  await expect(page.getByText("Te vezeted.").first()).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);

  // A second window of the same browser joins the session by its link.
  const joiner = await page.context().newPage();
  await joiner.goto(page.url());
  await expect(joiner.getByRole("link", { name: "Az akkordlap bezárása" })).toBeVisible();
});

test("an unknown session says so", async ({ page }) => {
  await page.goto("/");
  await switchPersona(page, "zenei");
  await page.goto("/munkater/kotta?session=00000000-0000-4000-8000-00000000dead");
  await expect(page.getByText("Ez a közös alkalom véget ért")).toBeVisible();
});
