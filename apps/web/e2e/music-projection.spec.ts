import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 5a (projection): the controller and the screen of an event, the themes page.
// Demo mode: fictitious songs, in-process database, the local (BroadcastChannel) realtime transport.

async function asMusicLeader(page: Page, path: string) {
  await page.goto("/");
  await switchPersona(page, "zenei");
  await page.goto(path);
}

async function newEvent(page: Page, title: string) {
  await asMusicLeader(page, "/munkater/esemenyek/uj");
  await page.getByLabel("Név").fill(title);
  await page.getByLabel("Kezdés").fill("2031-05-04T10:00");
  await page.getByRole("button", { name: "Esemény létrehozása" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const id = /\/munkater\/esemenyek\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  expect(id).toBeTruthy();
  return id!;
}

test("the controller shows the setlist of an event and puts a slide on the screen", async ({
  page,
  context,
}) => {
  const id = await newEvent(page, "Vetített alkalom");
  const add = page.getByRole("combobox", { name: "Programpont hozzáadása" });
  await add.fill("Áldás");
  await page.getByRole("option", { name: /Áldás, békesség/ }).click();
  await expect(page.getByText("Áldás, békesség").filter({ visible: true }).first()).toBeVisible();
  await add.fill("Köszöntés");
  await page.getByRole("option", { name: "Köszöntés" }).first().click();
  await expect(page.locator('input[value="Köszöntés"]').first()).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /Minden módosítás mentve|Mentve/ })
      .or(page.getByText(/Mentve|mentve/))
      .first(),
  ).toBeVisible();

  // The screen of the same browser: a second window.
  const screen = await context.newPage();
  await screen.goto(`/munkater/vetites/kepernyo?event=${id}`);

  await page.getByRole("link", { name: "Kivetítés" }).click();
  await expect(page).toHaveURL(new RegExp(`/munkater/vetites\\?event=${id}`));
  await expect(page.getByText("Dallista").first()).toBeVisible();
  await expect(page.getByText("Áldás, békesség").first()).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);

  await page.getByText("Áldás, békesség").first().click();
  await expect(page.getByText("Élő").first()).toBeVisible();
  expect(await axeSeriousOrCritical(screen)).toEqual([]);
});

test("the projection of an unknown event says so", async ({ page }) => {
  await asMusicLeader(page, "/munkater/vetites?event=00000000-0000-4000-8000-00000000dead");
  await expect(page.getByText("Nincs hozzáférésed ehhez a kivetítéshez")).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});

test("a role that may not edit events has no theme library", async ({ page }) => {
  await page.goto("/");
  await switchPersona(page, "onkentes");
  const response = await page.goto("/munkater/vetitesi-temak");
  // The nav item is not offered, and the page is empty for the role.
  await expect(page.getByRole("link", { name: "Vetítési témák" })).toHaveCount(0);
  expect(response?.status()).toBeLessThan(500);
});

test("a music leader creates and renames a projection theme", async ({ page }) => {
  await asMusicLeader(page, "/munkater/vetitesi-temak");
  await expect(page.getByRole("heading", { level: 1, name: "Vetítési témák" })).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  await page.getByRole("button", { name: "Új téma" }).first().click();
  await expect(page.getByLabel("Név").first()).toHaveValue("Új téma");
  await page.getByLabel("Név").first().fill("Reggeli téma");
  await page.getByRole("button", { name: "Mentés" }).first().click();
  await expect(page.getByText("Reggeli téma").first()).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});

test("the theme of an event is chosen on its page and kept", async ({ page }) => {
  await asMusicLeader(page, "/munkater/vetitesi-temak");
  await page.getByRole("button", { name: "Új téma" }).first().click();
  await expect(page.getByLabel("Név").first()).toHaveValue("Új téma");
  await page.getByLabel("Név").first().fill("Esti téma");
  await page.getByRole("button", { name: "Mentés" }).first().click();
  await expect(page.getByText("Esti téma").first()).toBeVisible();

  await newEvent(page, "Esti alkalom");
  const select = page.getByLabel("Vetítési téma", { exact: true });
  await select.selectOption({ label: "Esti téma" });
  await expect(select).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Vetítési téma", { exact: true })).toHaveValue(/.+/);
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});
