import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const MEDIA = "/fejlesztes/media";
const EDITOR = "/fejlesztes/szerkeszto";

async function axeSeriousOrCritical(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

const fakeImage = {
  name: "orgona.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
};

test.describe("media library", () => {
  test("shows the grid and quota, has no serious axe violations", async ({ page }) => {
    await page.goto(MEDIA);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("heading", { level: 1, name: "Médiatár" })).toBeVisible();
    await expect(page.getByTestId("media-grid").getByRole("listitem").first()).toBeVisible();
    await expect(page.getByTestId("media-usage")).toContainText("Felhasznált tárhely");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("upload needs alt text and the rights confirmation, then appears in the grid", async ({
    page,
  }) => {
    await page.goto(MEDIA);
    const items = page.getByTestId("media-grid").getByRole("listitem");
    const before = await items.count();

    await page.getByLabel("Fájl", { exact: true }).setInputFiles(fakeImage);
    await page.getByRole("button", { name: "Feltöltés", exact: true }).click();
    await expect(page.getByText("Adja meg a képleírást", { exact: false })).toBeVisible();
    await expect(page.getByText("meg kell erősítenie", { exact: false })).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await page.getByLabel("Képleírás (alt szöveg)").fill("Az orgona a karzaton");
    await page.getByLabel("Megerősítem, hogy jogom van a fájl közzétételére").check();
    await page.getByRole("button", { name: "Feltöltés", exact: true }).click();
    await expect(page.getByText("A(z) orgona.png feltöltése sikerült.")).toBeVisible();
    await expect(items).toHaveCount(before + 1);
    await expect(page.getByAltText("Az orgona a karzaton")).toBeVisible();
  });

  test("alt text can be edited but not cleared, and files can be deleted", async ({ page }) => {
    await page.goto(MEDIA);
    const first = page
      .getByTestId("media-grid")
      .getByRole("listitem")
      .filter({ has: page.locator("img") })
      .first();
    const filename = (await first.locator("p").first().textContent()) ?? "";
    await first.getByRole("button", { name: `Szerkesztés: ${filename}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Képleírás (alt szöveg)").fill("");
    await dialog.getByRole("button", { name: "Mentés" }).click();
    await expect(dialog.getByText("Adja meg a képleírást", { exact: false })).toBeVisible();
    await dialog.getByLabel("Képleírás (alt szöveg)").fill("Új leírás");
    await dialog.getByRole("button", { name: "Mentés" }).click();
    await expect(page.getByAltText("Új leírás")).toBeVisible();

    const count = await page.getByTestId("media-grid").getByRole("listitem").count();
    await first.getByRole("button", { name: `Törlés: ${filename}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Törlés" }).click();
    await expect(page.getByTestId("media-grid").getByRole("listitem")).toHaveCount(count - 1);
  });
});

test.describe("rich-text editor", () => {
  test("formats text and shows the stored JSON and the public rendering", async ({ page }) => {
    await page.goto(EDITOR);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const editor = page.getByRole("textbox", { name: "Tartalom" });
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Félkövér" }).click();
    await page.keyboard.type("Fontos hír");
    await expect(page.getByTestId("editor-json")).toContainText('"text": "Fontos hír"');
    await expect(page.getByTestId("editor-json")).toContainText('"type": "bold"');
    await expect(
      page.getByTestId("editor-preview").locator("strong", { hasText: "Fontos hír" }),
    ).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("rejects unsafe links and foreign embeds, accepts YouTube and OpenStreetMap", async ({
    page,
  }) => {
    await page.goto(EDITOR);
    const editor = page.getByRole("textbox", { name: "Tartalom" });
    await editor.click();

    await page.getByRole("button", { name: "Hivatkozás", exact: true }).click();
    await page.getByLabel("Hivatkozás címe").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Hivatkozás beállítása" }).click();
    await expect(page.getByText("Ez a cím nem engedélyezett", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Mégse" }).click();

    await page.getByRole("button", { name: "Videó vagy térkép beágyazása" }).click();
    await page.getByLabel("Videó vagy térkép címe").fill("https://vimeo.com/123456");
    await page.getByRole("button", { name: "Beágyazás", exact: true }).click();
    await expect(
      page.getByText("Csak YouTube-videó vagy OpenStreetMap", { exact: false }),
    ).toBeVisible();

    await page
      .getByLabel("Videó vagy térkép címe")
      .fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByRole("button", { name: "Beágyazás", exact: true }).click();
    const preview = page.getByTestId("editor-preview");
    await expect(preview.getByTestId("embed-facade")).toBeVisible();
    await expect(page.getByTestId("editor-json")).toContainText('"provider": "youtube"');
    // Click-to-load: no third-party frame until the visitor asks for it.
    await expect(page.locator("iframe")).toHaveCount(0);

    await page.getByRole("button", { name: "Videó vagy térkép beágyazása" }).click();
    await page
      .getByLabel("Videó vagy térkép címe")
      .fill("https://www.openstreetmap.org/?mlat=47.4979&mlon=19.0402");
    await page.getByRole("button", { name: "Beágyazás", exact: true }).click();
    await expect(page.getByTestId("editor-json")).toContainText('"provider": "openstreetmap"');
  });

  test("inserts an image chosen in the media picker with its alt text", async ({ page }) => {
    await page.goto(EDITOR);
    await page.getByRole("textbox", { name: "Tartalom" }).click();
    await page.getByRole("button", { name: "Kép beszúrása a médiatárból" }).click();
    const dialog = page.getByRole("dialog", { name: "Kép kiválasztása" });
    await expect(dialog).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await dialog
      .getByRole("button", { name: /^Kiválasztás: / })
      .first()
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("editor-json")).toContainText('"type": "image"');
    await expect(page.getByTestId("editor-json")).toContainText('"src": "/demo/templom.svg"');
    await expect(page.getByTestId("editor-preview").locator("img")).toHaveAttribute(
      "src",
      "/demo/templom.svg",
    );
  });
});
