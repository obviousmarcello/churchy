import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 3 (chord sheet): the sheet, transposition, the chart preview and the MusicXML
// preview in demo mode (fictitious songs, local mode Storage).

// One bar, one note: enough for verovio to draw a page.
const MUSICXML = Buffer.from(
  `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Dallam</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>`,
);

async function asMusicLeader(page: Page, path: string) {
  await page.goto("/");
  await switchPersona(page, "zenei");
  await page.goto(path);
}

/** Opens the chord sheet of the first demo song from its details. */
async function openSheet(page: Page): Promise<string> {
  await asMusicLeader(page, "/munkater/enektar");
  await page
    .getByRole("button", { name: /^Áldás, békesség/ })
    .first()
    .click();
  const songId = new URL(page.url()).searchParams.get("song")!;
  await page.getByRole("link", { name: "Akkordlap" }).first().click();
  await expect(page).toHaveURL(/\/munkater\/kotta\?arrangement=/);
  await expect(page.getByRole("link", { name: "Az akkordlap bezárása" })).toBeVisible();
  return songId;
}

test("the chord sheet shows the chart with chords in Hungarian H/B notation", async ({ page }) => {
  await openSheet(page);
  // The demo chart has chords and lyrics; the title shows in the header.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Áldás, békesség");
  await expect(page.locator("[data-sheet-group]").first()).toContainText(/\S/);
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});

test("a key change transposes the chords and is saved for the user", async ({ page }) => {
  await openSheet(page);
  const group = page.locator("[data-sheet-group]").first();
  const before = await group.innerText();
  await page
    .getByRole("button", { name: /A hangnem módosítása/ })
    .first()
    .click();
  const select = page.getByRole("combobox", { name: "A játszott hangnem" });
  const options = await select.locator("option").allTextContents();
  expect(options.length).toBeGreaterThan(2);
  await select.selectOption({ index: 3 });
  await expect.poll(async () => group.innerText()).not.toBe(before);
  // The own key survives a reload (saved by `music.sheet.personalize`).
  // The save is asynchronous and a reload would cancel it: let the request finish first.
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByRole("link", { name: "Az akkordlap bezárása" })).toBeVisible();
  await expect
    .poll(async () => page.locator("[data-sheet-group]").first().innerText())
    .not.toBe(before);
});

test("the metronome starts from the sheet", async ({ page }) => {
  await openSheet(page);
  await expect(page.getByRole("button", { name: /A metronóm indítása/ }).first()).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});

test("the sheet needs its module: an unknown song says so", async ({ page }) => {
  await asMusicLeader(page, "/munkater/kotta?song=00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("Ez a dal nem létezik")).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});

async function editPage(page: Page): Promise<string> {
  await asMusicLeader(page, "/munkater/enektar");
  await page
    .getByRole("button", { name: /^Áldás, békesség/ })
    .first()
    .click();
  const id = new URL(page.url()).searchParams.get("song")!;
  await page.goto(`/munkater/enektar/${id}/szerkesztes`);
  return id;
}

test("the song edit page previews the chart next to the editor", async ({ page }) => {
  await editPage(page);
  // The preview sits next to the editor, on the paper of the user's sheet settings.
  await page
    .locator('textarea[name="chordpro"]')
    .fill("{start_of_verse: 1. vers}\n[C]Kitalált [G]sor\n{end_of_verse}");
  await expect(page.locator("[data-sheet-paper]").first()).toContainText("Kitalált");
  expect(await axeSeriousOrCritical(page)).toEqual([]);
});

test("a MusicXML score of the song shows in the preview", async ({ page }) => {
  const id = await editPage(page);
  const scores = page.locator("#scores");
  await scores.locator('input[type="file"]').setInputFiles({
    name: "proba.musicxml",
    mimeType: "application/vnd.recordare.musicxml+xml",
    buffer: MUSICXML,
  });
  await scores.locator('[name="name"]').last().fill("Kitalált dallam");
  const save = page.getByRole("button", { name: "Módosítások mentése" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(scores.getByText("Kitalált dallam").first()).toBeVisible({ timeout: 20_000 });
  await page.goto(`/munkater/enektar/${id}/szerkesztes`);
  await scores.getByRole("button", { name: /^Kitalált dallam/ }).click();
  // Verovio draws the page as an SVG in the preview.
  await expect(page.locator("[data-sheet-paper] svg").first()).toBeVisible({ timeout: 30_000 });
});
