import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 2b (song files): PDFs, images, MusicXML, sound files and links in demo mode,
// stored in the in-memory Storage of local mode (fictitious files only).

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
);

async function asMusicLeader(page: Page, path: string) {
  await page.goto("/");
  await switchPersona(page, "zenei");
  await page.goto(path);
}

/** The first demo song (it has a fictitious PDF chart and a link). */
async function firstSong(page: Page): Promise<string> {
  await asMusicLeader(page, "/munkater/enektar");
  await page
    .getByRole("button", { name: /^Áldás, békesség/ })
    .first()
    .click();
  await expect(page).toHaveURL(/song=/);
  return new URL(page.url()).searchParams.get("song")!;
}

test("the details list the seeded PDF and link; the PDF opens and downloads", async ({ page }) => {
  await firstSong(page);
  await expect(page.getByRole("link", { name: /Kottakép \(bemutató\)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Felvétel \(példa\)/ })).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);

  await page.getByRole("link", { name: /Kottakép \(bemutató\)/ }).click();
  await expect(page).toHaveURL(/\/munkater\/enektar\/pdf\//);
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  const href = await page
    .locator('a[href*="/munkater/enektar/fajl/pdf/"]')
    .first()
    .getAttribute("href");
  expect(href).toBeTruthy();
  const file = await page.request.get(href!);
  expect(file.ok()).toBe(true);
  expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("a music leader adds a PDF and a link on the edit page", async ({ page }) => {
  const id = await firstSong(page);
  await page.goto(`/munkater/enektar/${id}/szerkesztes`);
  expect(await axeSeriousOrCritical(page)).toEqual([]);

  const pdfs = page.locator("#pdfs");
  await pdfs.locator('input[type="file"]').setInputFiles({
    name: "proba-kotta.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  const links = page.locator("#links");
  await links.locator('[name="name"]').last().fill("Kitalált videó");
  await links.locator('[name="url"]').last().fill("https://example.org/video");
  // One save button saves every part with changes (their `PageSave`).
  await page.getByRole("button", { name: "Módosítások mentése" }).click();
  await expect(page.locator("#pdfs").getByText("proba-kotta").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.goto(`/munkater/enektar/${id}/szerkesztes`);
  await expect(page.locator("#pdfs").getByText("proba-kotta").first()).toBeVisible();
  await expect(page.locator("#links").getByText("Kitalált videó").first()).toBeVisible();
});

test("a volunteer reads the files but cannot reach the edit page", async ({ page }) => {
  await page.goto("/");
  await switchPersona(page, "onkentes");
  await page.goto("/munkater/enektar");
  await page
    .getByRole("button", { name: /^Áldás, békesség/ })
    .first()
    .click();
  await expect(page.getByRole("link", { name: /Kottakép \(bemutató\)/ })).toBeVisible();
  const id = new URL(page.url()).searchParams.get("song");
  await page.goto(`/munkater/enektar/${id}/szerkesztes`);
  await expect(page.locator("#pdfs")).toHaveCount(0);
});
