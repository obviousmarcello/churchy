import { expect, test, type Page } from "@playwright/test";
import {
  CHURCHES,
  axeSeriousOrCritical,
  switchContext,
  switchPersona,
  type PersonaKey,
} from "./demo-helpers";

// Music merge phase 2 (song catalog): Music Sheet DB's song screens under /munkater/enektar, in
// demo mode against the in-process Postgres (no credentials), each visitor with own data.

async function as(page: Page, persona: PersonaKey, path: string) {
  await page.goto("/");
  await switchPersona(page, persona);
  await page.goto(path);
}

const songId = (page: Page) => new URL(page.url()).searchParams.get("song");

const search = (page: Page) =>
  page
    .getByRole("searchbox")
    .or(page.getByLabel(/Keresés cím/))
    .first();

test.describe("Énektár (music module)", () => {
  test("list, accent-insensitive search, details and axe", async ({ page }) => {
    await as(page, "zenei", "/munkater/enektar");
    await expect(page.getByText("1–25 (összesen 44)")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Hungarian search without accents (search_key: unaccent + fold).
    await page.goto("/munkater/enektar?q=dicsoseg");
    const first = page.getByRole("button", { name: /Dicsőség mennyben az Istennek/ });
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/song=/);
    await expect(
      page.getByRole("heading", { name: "Dicsőség mennyben az Istennek", level: 2 }),
    ).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("new song with rights fields, edit, shared rights catalog, delete", async ({ page }) => {
    await as(page, "zenei", "/munkater/enektar/uj");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.locator('[name="title"]').fill("Próba ének a katalógushoz");
    await page.locator('[name="authors"]').fill("Kitalált Szerző");
    await page.locator('[name="chordpro"]').fill("{key: G}\n[G]Ez egy kitalált [D]próba sor");
    await page.getByRole("button", { name: "Jogok" }).click();
    await page.locator('[name="copyright"]').fill("© Kitalált Kiadó\nCCLI 7654321");
    await page.getByRole("button", { name: "Dal hozzáadása" }).click();
    await expect(page).toHaveURL(/\/munkater\/enektar\?song=/);
    await expect(
      page.getByRole("heading", { name: "Próba ének a katalógushoz", level: 2 }),
    ).toBeVisible();
    await expect(page.getByText("Kitalált Szerző").first()).toBeVisible();

    // Edit: the default arrangement's chart carries the lyrics.
    await page.goto(`/munkater/enektar/${songId(page)}/szerkesztes`);
    await expect(page.locator('[name="chordpro"]')).toHaveValue(/kitalált \[D\]próba sor/);
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Another church sees the shared rights facts (CCLI number) for a song of its own.
    await page.goto("/");
    await switchContext(page, CHURCHES.reformed);
    await page.goto("/munkater/enektar/uj");
    await page.locator('[name="title"]').fill("Próba ének a katalógushoz");
    await page.locator('[name="chordpro"]').fill("Kitalált sor");
    await page.getByRole("button", { name: "Jogok" }).click();
    await page.locator('[name="copyright"]').fill("CCLI 7654321");
    await page.getByRole("button", { name: "Dal hozzáadása" }).click();
    await expect(page).toHaveURL(/song=/);
    await page.goto(`/munkater/enektar/${songId(page)}/szerkesztes`);
    // The rights part is open: the song has a copyright text.
    const shared = page.getByTestId("shared-rights");
    await expect(shared).toContainText("Kitalált Szerző");
    await shared.getByRole("button", { name: "Üres mezők kitöltése a katalógusból" }).click();
    await expect(page.locator('[name="authors"]')).toHaveValue("Kitalált Szerző");

    // Delete from the song details.
    await page.goto("/munkater/enektar?q=" + encodeURIComponent("Próba ének"));
    await page
      .getByRole("button", { name: /Próba ének a katalógushoz/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Dal törlése" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Dal törlése" }).click();
    await expect(page.getByRole("button", { name: /Próba ének a katalógushoz/ })).toHaveCount(0);
  });

  test("a volunteer may read the songs, not add them", async ({ page }) => {
    await as(page, "onkentes", "/munkater/enektar");
    await expect(page.getByText("1–25 (összesen 44)")).toBeVisible();
    await expect(page.getByRole("link", { name: "Dal hozzáadása" })).toHaveCount(0);
    await page.goto("/munkater/enektar/uj");
    await expect(
      page.getByText("Ehhez nincs jogosultságod").or(page.getByRole("heading", { level: 1 })),
    ).toBeVisible();
    await expect(page.locator('[name="title"]')).toHaveCount(0);
  });

  test("song rights and rights proposals pages", async ({ page }) => {
    await as(page, "zenei", "/munkater/enektar/jogok");
    await expect(page.getByTestId("ai-research-off")).toContainText("Demó módban");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.goto("/munkater/enektar/jogi-javaslatok");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });
});

test("search box", async ({ page }) => {
  await as(page, "zenei", "/munkater/enektar");
  await search(page).fill("csendes");
  await expect(page.getByRole("button", { name: /Csendes éj/ })).toBeVisible();
});
