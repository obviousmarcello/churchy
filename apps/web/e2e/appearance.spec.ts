import { gotoHome } from "./site-helpers";
import { expect, test, type Page } from "@playwright/test";
import { CHURCHES, axeSeriousOrCritical, switchContext, switchPersona } from "./demo-helpers";

/**
 * D-24 [UI]: the appearance screens (branding and theme picker with live preview and the 4.5:1
 * colour check, home composer, navigation and footer editors) and the three themes on the public
 * site. Demo data lives in the visitor's own session, so every test starts from the seed.
 */
const BASE = "/admin/megjelenes";

async function asOwner(page: Page, church: string = CHURCHES.catholic) {
  await gotoHome(page);
  if (church !== CHURCHES.catholic) await switchContext(page, church);
  await switchPersona(page, "tulajdonos");
}

test.describe("appearance: access", () => {
  test("a visitor and an editor get no access; the owner does", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByTestId("area-no-access")).toBeVisible();
    await switchPersona(page, "szerkeszto");
    await page.goto(BASE);
    await expect(page.getByTestId("area-no-access")).toBeVisible();
    await switchPersona(page, "tulajdonos");
    await page.goto(BASE);
    await expect(page.getByRole("heading", { level: 2, name: "Arculat" })).toBeVisible();
  });
});

test.describe("appearance: branding and themes", () => {
  test("the theme picker re-themes the live preview", async ({ page }) => {
    await asOwner(page);
    await page.goto(BASE);
    const preview = page.locator('[data-testid="theme-preview"] [data-preview-theme]');
    await expect(preview).toHaveAttribute("data-preview-theme", "klasszikus");
    for (const id of ["letisztult", "kozossegi", "klasszikus"]) {
      await page.locator(`[data-theme-option="${id}"]`).click();
      await expect(preview).toHaveAttribute("data-preview-theme", id);
      await expect(page.locator(`[data-theme-option="${id}"]`)).toHaveAttribute(
        "aria-checked",
        "true",
      );
    }
    // The font follows the theme without a rebuild.
    await page.locator('[data-theme-option="kozossegi"]').click();
    const font = await preview.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font).toContain("Nunito Sans");
  });

  test("blocks a colour below 4.5:1, suggests the nearest shade and saves", async ({ page }) => {
    await asOwner(page);
    await page.goto(BASE);
    const primary = page.getByLabel("Fő szín", { exact: true });
    await primary.fill("#d9a441");
    await expect(page.getByText(/kevesebb a szükséges 4,5:1-nél/)).toBeVisible();
    const save = page.getByRole("button", { name: "Mentés" });
    await expect(save).toBeDisabled();
    await page.getByTestId("use-suggestion").click();
    await expect(page.getByTestId("contrast-ok")).toBeVisible();
    await expect(save).toBeEnabled();
    await page.getByLabel("Mottó").fill("Nyitott ajtó, nyitott szív");
    await save.click();
    await expect(page.getByText("A módosítások mentve")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Mottó")).toHaveValue("Nyitott ajtó, nyitott szív");
    await expect(page.getByTestId("contrast-ok").first()).toBeVisible();
  });

  test("a saved theme shows on the public site without a rebuild", async ({ page }) => {
    await asOwner(page);
    await page.goto(BASE);
    await page.locator('[data-theme-option="letisztult"]').click();
    await page.getByRole("button", { name: "Mentés" }).click();
    await expect(page.getByText("A módosítások mentve")).toBeVisible();
    await gotoHome(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "letisztult");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });
});

test.describe("appearance: home composer", () => {
  test("adds, reorders and removes sections; the public home follows", async ({ page }) => {
    await asOwner(page);
    await page.goto(`${BASE}/nyitooldal`);
    const list = page.getByTestId("home-sections");
    const order = () =>
      list.locator("li").evaluateAll((els) => els.map((e) => e.getAttribute("data-section-type")));
    const before = await order();
    expect(before.length).toBeGreaterThan(3);

    // Move the last section to the top, with the keyboard-friendly buttons.
    const last = list.locator("li").last();
    const lastType = before.at(-1)!;
    for (let i = 0; i < before.length - 1; i++) {
      await list
        .locator(`li[data-section-type="${lastType}"]`)
        .getByRole("button", { name: /^Fel: / })
        .click();
    }
    expect((await order())[0]).toBe(lastType);
    await expect(last).toBeAttached();

    // Add a quote with settings; the preview shows it.
    await page.getByLabel("Új rész hozzáadása").selectOption("quote");
    await page.getByRole("button", { name: "Hozzáadás" }).click();
    await expect(page.getByRole("button", { name: "Mentés" })).toBeDisabled();
    await list
      .locator('li[data-section-type="quote"]')
      .getByLabel("Idézet szövege")
      .fill("Az Úr az én pásztorom.");
    await expect(page.getByRole("button", { name: "Mentés" })).toBeEnabled();
    await expect(
      page.locator('[data-testid="home-preview"] [data-preview-section="quote"]'),
    ).toBeVisible();

    await page.getByRole("button", { name: "Mentés" }).click();
    await expect(page.getByText("A módosítások mentve")).toBeVisible();
    await gotoHome(page);
    await expect(page.locator('[data-home-section="quote"]')).toContainText(
      "Az Úr az én pásztorom.",
    );
    const sections = await page
      .locator("[data-home-section]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-home-section")));
    expect(sections).toContain("quote");
  });

  test("offers the section types of the enabled modules", async ({ page }) => {
    await asOwner(page);
    await page.goto(`${BASE}/nyitooldal`);
    // Empty the list, then count what can be added.
    const list = page.getByTestId("home-sections");
    while ((await list.locator("li").count()) > 0) {
      await list
        .locator("li")
        .first()
        .getByRole("button", { name: /^Eltávolítás: / })
        .click();
    }
    await expect(page.getByTestId("home-empty")).toBeVisible();
    const options = await page.getByLabel("Új rész hozzáadása").locator("option").count();
    expect(options - 1).toBeGreaterThanOrEqual(8); // modules of the parish enable most types
  });
});

test.describe("appearance: navigation and footer", () => {
  test("renames, nests and saves the navigation", async ({ page }) => {
    await asOwner(page);
    await page.goto(`${BASE}/menu`);
    const rows = page.locator("[data-nav-row]");
    const first = rows.first();
    await first.getByLabel("Megnevezés").fill("Alkalmaink");
    await page.getByRole("button", { name: "Menüpont hozzáadása", exact: true }).click();
    const added = page.locator("[data-nav-row]").last();
    await added.getByLabel("Megnevezés").fill("Plébánia honlapja");
    await added.getByLabel("Cím").fill("https://pelda.example/plebania");
    await expect(added.getByText("Külső hivatkozás")).toBeVisible();
    await added.getByRole("button", { name: /^Almenübe: / }).click();
    // Nested at most two levels: the new child has no "nest" button.
    await expect(
      page
        .locator("[data-nav-row$='-0']")
        .last()
        .getByRole("button", { name: /^Almenübe: / }),
    ).toHaveCount(0);
    await expect(page.getByTestId("nav-preview")).toContainText("Alkalmaink");
    await expect(page.getByTestId("nav-preview")).toContainText("Plébánia honlapja");

    // An invalid address blocks saving.
    await first.getByLabel("Cím").fill("javascript:alert(1)");
    await expect(page.getByRole("button", { name: "Mentés" })).toBeDisabled();
    await first.getByLabel("Cím").fill("/miserend");
    await page.getByRole("button", { name: "Mentés" }).click();
    await expect(page.getByText("A módosítások mentve")).toBeVisible();
    await page.reload();
    await expect(page.locator("[data-nav-row]").first().getByLabel("Megnevezés")).toHaveValue(
      "Alkalmaink",
    );
    await expect(page.getByTestId("nav-preview")).toContainText("Plébánia honlapja");
  });

  test("edits footer links and the diocese link", async ({ page }) => {
    await asOwner(page);
    await page.goto(`${BASE}/lablec`);
    await page.getByRole("button", { name: "Hivatkozás hozzáadása" }).click();
    const row = page.locator("[data-nav-row]").last();
    await row.getByLabel("Megnevezés").fill("Ifjúsági csoport");
    await row.getByLabel("Cím").fill("/ifjusagi");
    await page.getByLabel("Webcím").fill("nem webcím");
    await expect(page.getByRole("button", { name: "Mentés" })).toBeDisabled();
    await page.getByLabel("Webcím").fill("https://pelda.example/egyhazmegye");
    await page.getByRole("button", { name: "Mentés" }).click();
    await expect(page.getByText("A módosítások mentve")).toBeVisible();
    await page.reload();
    await expect(page.locator("[data-nav-row]").last().getByLabel("Megnevezés")).toHaveValue(
      "Ifjúsági csoport",
    );
  });
});

test.describe("appearance: accessibility", () => {
  test("the four screens pass axe in the desktop and mobile projects", async ({ page }) => {
    await asOwner(page);
    for (const path of [BASE, `${BASE}/nyitooldal`, `${BASE}/menu`, `${BASE}/lablec`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "Megjelenés" })).toBeVisible();
      expect(await axeSeriousOrCritical(page), path).toEqual([]);
    }
  });

  test("the branding screen passes axe with each theme selected", async ({ page }) => {
    await asOwner(page);
    await page.goto(BASE);
    for (const id of ["letisztult", "kozossegi", "klasszikus"]) {
      await page.locator(`[data-theme-option="${id}"]`).click();
      expect(await axeSeriousOrCritical(page), id).toEqual([]);
    }
  });
});

test.describe("themes on the demo churches", () => {
  const DEFAULTS = [
    [CHURCHES.catholic, "klasszikus"],
    [CHURCHES.reformed, "letisztult"],
    [CHURCHES.baptist, "kozossegi"],
  ] as const;

  test("each church renders its own theme, with ő and ű in the web font, and passes axe", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoHome(page);
    for (const [church, theme] of DEFAULTS) {
      await switchContext(page, church);
      await gotoHome(page);
      await expect(page.locator("html"), church).toHaveAttribute("data-theme", theme);
      // Fonts are self-hosted: the face is loaded (latin-ext covers ő/ű), not substituted.
      const loaded = await page.evaluate(async () => {
        const heading = getComputedStyle(document.querySelector("h1")!).fontFamily;
        const family = heading.split(",")[0]!.replace(/["']/g, "").trim();
        await document.fonts.load(`16px "${family}"`, "őŐűŰ");
        return { family, ok: document.fonts.check(`16px "${family}"`, "őŐűŰ") };
      });
      expect(loaded.ok, `${church}: ${loaded.family}`).toBe(true);
      expect(await axeSeriousOrCritical(page), church).toEqual([]);
    }
  });
});
