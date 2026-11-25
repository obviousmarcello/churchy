import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 4a (events): list, create (single and series), items (songs and text), blocks,
// edit, the chord sheet of an event, delete. Demo mode: fictitious songs, in-process database.

async function asMusicLeader(page: Page, path: string) {
  await page.goto("/");
  await switchPersona(page, "zenei");
  await page.goto(path);
}

test("a music leader creates an event, builds its setlist and opens its chord sheet", async ({
  page,
}) => {
  await asMusicLeader(page, "/munkater/esemenyek");
  await expect(page.getByRole("heading", { level: 1, name: "Események" })).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);

  await page.getByRole("link", { name: "Új esemény" }).click();
  await page.getByLabel("Név").fill("Vasárnapi próba");
  await page.getByLabel("Kezdés").fill("2031-03-02T17:00");
  await page.getByLabel("Ismétlődés").selectOption("weekly");
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  await page.getByRole("button", { name: "Esemény létrehozása" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vasárnapi próba" })).toBeVisible();
  await expect(page.getByText("Még nincs programpont.")).toBeVisible();

  // A song from the catalog.
  await page.getByLabel("Dal keresése").fill("Áldás");
  await page.getByRole("button", { name: "Keresés" }).click();
  await page.getByRole("button", { name: "Hozzáadás" }).first().click();
  await expect(page.getByRole("list").filter({ hasText: "Áldás, békesség" }).first()).toBeVisible();

  // A text item, then the order changes.
  await page.getByLabel("Szöveges programpont").fill("Köszöntés");
  await page.getByRole("button", { name: "Hozzáadás" }).last().click();
  await expect(page.getByText("Köszöntés")).toBeVisible();
  await page.getByRole("button", { name: "Feljebb" }).nth(1).click();
  await expect(page.getByRole("listitem").filter({ hasText: "1." }).first()).toContainText(
    "Köszöntés",
  );
  expect(await axeSeriousOrCritical(page)).toEqual([]);

  // The chord sheet of the event.
  await page.getByRole("link", { name: "Kotta megnyitása" }).click();
  await expect(page).toHaveURL(/\/munkater\/kotta\?.*event=|\/munkater\/kotta\?arrangement=/);
  await expect(page.getByRole("link", { name: "Az akkordlap bezárása" })).toBeVisible();
});

test("an event can be edited and deleted", async ({ page }) => {
  await asMusicLeader(page, "/munkater/esemenyek/uj");
  await page.getByLabel("Név").fill("Törlendő alkalom");
  await page.getByLabel("Kezdés").fill("2031-04-06T10:00");
  await page.getByRole("button", { name: "Esemény létrehozása" }).click();
  await page.getByRole("link", { name: "Szerkesztés" }).click();
  await page.getByLabel("Név").fill("Átnevezett alkalom");
  await page.getByRole("button", { name: "Mentés" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Átnevezett alkalom" })).toBeVisible();
  await page.getByRole("link", { name: "Szerkesztés" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Esemény törlése" }).click();
  await expect(page).toHaveURL(/\/munkater\/esemenyek$/);
  await expect(page.getByText("Átnevezett alkalom")).toHaveCount(0);
});

test("a role without music.event.manage sees events but no edit controls", async ({ page }) => {
  await page.goto("/");
  await switchPersona(page, "onkentes");
  await page.goto("/munkater/esemenyek");
  await expect(page.getByRole("heading", { level: 1, name: "Események" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Új esemény" })).toHaveCount(0);
  await page.goto("/munkater/esemenyek/uj");
  await expect(page.getByText(/nem található|404/i).first()).toBeVisible();
});

test("groups and the team of an event", async ({ page }) => {
  await asMusicLeader(page, "/munkater/esemenyek/csoportok");
  await expect(page.getByRole("heading", { level: 1, name: "Csoportok" })).toBeVisible();
  await page.getByPlaceholder("Csoport neve").fill("Énekkar");
  await page.getByRole("button", { name: "Létrehozás" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Énekkar" })).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);

  // A member of the new group.
  await page
    .getByRole("listitem")
    .filter({ hasText: "Énekkar" })
    .getByRole("button", { name: /Tagok/ })
    .click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Tagok mentése" }).click();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Énekkar" })
      .getByRole("button", { name: "Tagok (1)" }),
  ).toBeVisible();

  // The team of an event: the area gets that person.
  await page.goto("/munkater/esemenyek/uj");
  await page.getByLabel("Név").fill("Csapatos alkalom");
  await page.getByLabel("Kezdés").fill("2031-05-04T10:00");
  await page.getByRole("button", { name: "Esemény létrehozása" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Csapat" })).toBeVisible();
  await page.getByLabel("Terület").selectOption({ label: "Énekkar" });
  await page.getByRole("group", { name: "Emberek" }).getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Csapat mentése" }).click();
  await expect(page.getByText(/^Énekkar:/)).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});

test("an area role lets a volunteer create and edit events of that area only", async ({ page }) => {
  await asMusicLeader(page, "/munkater/esemenyek/csoportok");
  await page.getByPlaceholder("Csoport neve").fill("Szolgálók");
  await page.getByRole("button", { name: "Létrehozás" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Szolgálók" });
  await row.getByRole("button", { name: /Tagok/ }).click();
  await row.getByRole("checkbox", { name: "Események kezelője" }).check();
  await row.getByRole("button", { name: "Szerepek mentése" }).click();
  for (const box of await row.locator('input[name="userId"]').all()) await box.check();
  await row.getByRole("button", { name: "Tagok mentése" }).click();
  await expect(row.getByRole("button", { name: /Tagok \([1-9]/ })).toBeVisible();

  await page.goto("/");
  await switchPersona(page, "onkentes");
  await page.goto("/munkater/esemenyek");
  await page.getByRole("link", { name: "Új esemény" }).click();
  await expect(page.getByRole("group", { name: "Területek" })).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  await page.getByLabel("Név").fill("Szolgálói alkalom");
  await page.getByLabel("Kezdés").fill("2031-06-01T10:00");
  await page.getByRole("button", { name: "Esemény létrehozása" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Szolgálói alkalom" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Szerkesztés" })).toBeVisible();
});

test("a user turns the calendar feed on with consent and gets a private link", async ({ page }) => {
  await asMusicLeader(page, "/munkater/esemenyek/naptar");
  await expect(page.getByText("A naptár ki van kapcsolva.")).toBeVisible();
  await page.getByRole("button", { name: "Link készítése" }).click();
  // The browser's own validation holds the form until the consent is checked.
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Link készítése" }).click();
  await expect(page.getByLabel(/A naptárad linkje/)).toHaveValue(
    /\/api\/music\/calendar\/[0-9a-f]{64}\.ics$/,
  );
  await expect(page.getByText("A naptár be van kapcsolva.")).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  await page.getByRole("button", { name: "Kikapcsolás" }).click();
  await expect(page.getByText("A naptár ki van kapcsolva.")).toBeVisible();
});

// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("an event gets an image set and an announcement as program points", async ({ page }) => {
  await asMusicLeader(page, "/munkater/esemenyek/uj");
  await page.getByLabel("Név").fill("Képes alkalom");
  await page.getByLabel("Kezdés").fill("2031-07-06T10:00");
  await page.getByRole("button", { name: "Esemény létrehozása" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Képek" })).toBeVisible();

  await page.getByPlaceholder("A programpont neve").first().fill("Hírek képekben");
  await page.getByRole("button", { name: "Új képkészlet" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Hírek képekben" })).toBeVisible();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "kep.png", mimeType: "image/png", buffer: PNG });
  await page.locator('button[type="submit"]', { hasText: "Kép feltöltése" }).click();
  await expect(page.getByRole("img", { name: /Kép/ }).first()).toBeVisible({ timeout: 20_000 });
  expect(await axeSeriousOrCritical(page)).toEqual([]);

  await page.getByPlaceholder("A programpont neve").last().fill("Hirdetések");
  await page.getByRole("button", { name: "Új hirdetés" }).click();
  await expect(page.getByText("Nincs bejegyzés.")).toBeVisible();
  await page.getByLabel("Cím", { exact: true }).fill("Takarítás");
  await page.getByLabel("Nap").fill("2031-07-10");
  await page.getByRole("button", { name: "Hozzáadás" }).last().click();
  await expect(page.getByRole("listitem").filter({ hasText: "Takarítás" })).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});

test("a superadmin manages the announcement calendars", async ({ page }) => {
  await asMusicLeader(page, "/munkater/esemenyek/hirdetesek");
  await page.getByLabel("Név").fill("Plébánia");
  await page.getByLabel("Naptár címe (https)").fill("https://example.com/plebania.ics");
  await page.getByRole("button", { name: "Naptár hozzáadása" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Plébánia" })).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  await page.getByRole("button", { name: "Törlés" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Plébánia" })).toHaveCount(0);
});

test("the bulk form creates series, items reorder by drag and drop and get a volunteer", async ({
  page,
}) => {
  await asMusicLeader(page, "/munkater/esemenyek/uj/sorozat");
  await page.getByLabel("Első nap").fill("2031-09-01");
  await page.getByLabel("Utolsó nap").fill("2031-09-30");
  await page.getByPlaceholder("Név").fill("Reggeli alkalom");
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  await page.getByRole("button", { name: "Sorozatok létrehozása" }).click();
  await expect(page.getByRole("link", { name: /Reggeli alkalom/ }).first()).toBeVisible();

  // A single event with two text items and a team member.
  await page.goto("/munkater/esemenyek/uj");
  await page.getByLabel("Név").fill("Húzós alkalom");
  await page.getByLabel("Kezdés").fill("2031-10-05T10:00");
  await page.getByRole("button", { name: "Esemény létrehozása" }).click();
  for (const title of ["Első", "Második"]) {
    await page.getByLabel("Szöveges programpont").fill(title);
    await page.getByRole("button", { name: "Hozzáadás" }).last().click();
    await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
  }
  const rows = page.locator("ol > li");
  await expect(rows.first()).toContainText("Első");
  await rows.nth(1).dragTo(rows.first());
  await expect(rows.first()).toContainText("Második");
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});
