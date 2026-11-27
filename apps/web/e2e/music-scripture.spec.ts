import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 6 (scripture): the church's Bible translations page, a reading with the text of
// Károli 1908 (public domain, static files) on the projection controller. Demo mode; the texts that
// the church uploads here are fictitious.

async function asMusicLeader(page: Page, path: string) {
  await page.goto("/");
  await switchPersona(page, "zenei");
  await page.goto(path);
}

test("the church adds a translation of its own and uploads a book", async ({ page }) => {
  await asMusicLeader(page, "/munkater/biblia-forditasok");
  await expect(page.getByRole("heading", { level: 1, name: "Bibliafordítások" })).toBeVisible();
  await expect(page.getByText("Károli Gáspár revideált fordítása (1908)")).toBeVisible();

  await page.getByRole("button", { name: "Fordítás felvétele" }).click();
  await page.getByLabel("Azonosító", { exact: true }).fill("proba");
  await page.getByLabel("Teljes név").fill("Próba fordítás");
  await page.getByLabel("Rövid név").fill("Próba");
  await page.getByLabel("A szöveg forrása").selectOption("database");
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  await page.getByRole("button", { name: "Mentés" }).click();
  await expect(page.getByText("Próba fordítás")).toBeVisible();
  await expect(page.getByText("0 könyv feltöltve")).toBeVisible();

  await page.getByLabel("Könyv", { exact: true }).selectOption({ label: "János" });
  await page.getByLabel("Könyv szövege (JSON)").setInputFiles({
    name: "janos.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        chapters: [
          ["Első kitalált vers."],
          ["Második kitalált vers."],
          ["Harmadik kitalált vers.", "Negyedik kitalált vers."],
        ],
      }),
    ),
  });
  await expect(page.getByText("1 könyv feltöltve")).toBeVisible();

  // The text is served to the church's signed-in users only.
  const book = await page.request.get("/munkater/biblia-szoveg/proba/John");
  expect(book.status()).toBe(200);
  expect((await book.json()).chapters[2][1]).toBe("Negyedik kitalált vers.");
  expect((await page.request.get("/munkater/biblia-szoveg/nincs/John")).status()).toBe(409);

  // Deleting the translation takes its text with it.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Törlés", exact: true }).click();
  await expect(page.getByText("Még nincs saját fordításotok.")).toBeVisible();
  expect((await page.request.get("/munkater/biblia-szoveg/proba/John")).status()).toBe(409);
});

test("a scripture reading shows its Károli text on the controller", async ({ page }) => {
  await asMusicLeader(page, "/munkater/esemenyek/uj");
  await page.getByLabel("Név").fill("Igés alkalom");
  await page.getByLabel("Kezdés").fill("2031-06-01T10:00");
  await page.getByRole("button", { name: "Esemény létrehozása" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Igés alkalom" })).toBeVisible();
  const id = /\/munkater\/esemenyek\/([0-9a-f-]{36})/.exec(page.url())?.[1];

  const add = page.getByRole("combobox", { name: "Programpont hozzáadása" });
  await add.fill("Jn 3,16");
  await page.getByRole("option", { name: /igeolvasásként/ }).click();
  await expect(page.getByText("Minden módosítás mentve").first()).toBeVisible();

  await page.goto(`/munkater/vetites?event=${id}`);
  await page.getByText("Jn 3,16").first().click();
  await expect(page.getByText(/Mert úgy szerette Isten e világot/).first()).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});

test("the text of a pasted translation goes into the church's cache from the controller", async ({
  page,
}) => {
  await asMusicLeader(page, "/munkater/biblia-forditasok");
  await page.getByRole("button", { name: "Fordítás felvétele" }).click();
  await page.getByLabel("Azonosító", { exact: true }).fill("beillesztett");
  await page.getByLabel("Teljes név").fill("Beillesztett fordítás");
  await page.getByLabel("Rövid név").fill("Beill");
  await page.getByRole("button", { name: "Mentés" }).click();
  await expect(page.getByText("Beillesztett fordítás")).toBeVisible();

  await page.goto("/munkater/esemenyek/uj");
  await page.getByLabel("Név").fill("Beillesztett ige");
  await page.getByLabel("Kezdés").fill("2031-06-08T10:00");
  await page.getByRole("button", { name: "Esemény létrehozása" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Beillesztett ige" })).toBeVisible();
  const id = /\/munkater\/esemenyek\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  const add = page.getByRole("combobox", { name: "Programpont hozzáadása" });
  await add.fill("Jn 3,16");
  await page.getByRole("option", { name: /igeolvasásként/ }).click();
  await expect(page.getByText("Minden módosítás mentve").first()).toBeVisible();

  await page.goto(`/munkater/vetites?event=${id}`);
  await page.getByText("Jn 3,16").first().click();
  await page
    .getByRole("combobox", { name: "„Jn 3,16” fordítása" })
    .selectOption({ label: "Beill" });
  await page.getByRole("button", { name: "Szöveg bemásolása" }).first().click();
  await page
    .getByLabel("Szöveg", { exact: true })
    .fill("16 Kitalált szöveg a bemásolt fordításból.");
  await expect(page.getByText("Kitalált szöveg a bemásolt fordításból.").first()).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  await page.getByRole("button", { name: "Mentés a gyorsítótárba" }).click();
  await expect(page.getByText("Kitalált szöveg a bemásolt fordításból.").first()).toBeVisible();
  // A reload still finds it in the cache.
  await page.reload();
  await page.getByText("Jn 3,16").first().click();
  await page
    .getByRole("combobox", { name: "„Jn 3,16” fordítása" })
    .selectOption({ label: "Beill" });
  await expect(page.getByText("Kitalált szöveg a bemásolt fordításból.").first()).toBeVisible();
});

test("the chord sheet of an event shows its scripture reading between the songs", async ({
  page,
}) => {
  await asMusicLeader(page, "/munkater/esemenyek/uj");
  await page.getByLabel("Név").fill("Igés kotta");
  await page.getByLabel("Kezdés").fill("2031-06-15T10:00");
  await page.getByRole("button", { name: "Esemény létrehozása" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Igés kotta" })).toBeVisible();
  const id = /\/munkater\/esemenyek\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  const add = page.getByRole("combobox", { name: "Programpont hozzáadása" });
  await add.fill("Áldás");
  await page.getByRole("option", { name: /Áldás, békesség/ }).click();
  await add.fill("Jn 3,16");
  await page.getByRole("option", { name: /igeolvasásként/ }).click();
  await expect(page.getByText("Minden módosítás mentve").first()).toBeVisible();

  await page.goto(`/munkater/kotta?event=${id}`);
  await expect(page.getByText(/Mert úgy szerette Isten e világot/).first()).toBeVisible();
  await expect(page.getByText("Áldás, békesség").first()).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});

test("the workspace home shows the psalm of the day from Károli", async ({ page }) => {
  await asMusicLeader(page, "/munkater");
  const psalm = page.getByTestId("daily-psalm");
  await expect(psalm).toBeVisible();
  await expect(psalm.getByText(/Zsoltárok \d+,\d+(–\d+)? \(Károli\)/)).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  await psalm.getByRole("button", { name: "A nap zsoltára" }).click();
  await expect(psalm.getByText(/Zsoltárok/)).toBeHidden();
});
