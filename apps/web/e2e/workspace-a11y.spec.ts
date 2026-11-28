import { expect, test } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

/** Design v2 restyle of the workspace: every main route has 0 serious/critical axe violations and no sideways scroll. */
const ROUTES = [
  "/munkater",
  "/munkater/naptar",
  "/munkater/naptar/het",
  "/munkater/naptar/uj",
  "/munkater/nevjegyzek",
  "/munkater/csapatok",
  "/munkater/foglalas",
  "/munkater/foglalas/termek",
  "/munkater/foglalas/jovahagyas",
  "/munkater/foglalas/enyim",
  "/munkater/liturgia",
  "/munkater/liturgia/sablonok",
  "/munkater/tavollet",
  "/munkater/hr",
  "/munkater/hr/uj",
  "/munkater/ertesitesek",
  "/munkater/enektar",
  "/munkater/enektar/uj",
  "/munkater/kotta",
  "/munkater/esemenyek",
  "/munkater/esemenyek/uj",
  "/munkater/proba",
  "/munkater/kepzesek",
  "/munkater/keverpult",
  "/munkater/biblia-szoveg",
  "/munkater/vetites",
  "/munkater/vetitesi-temak",
];

test.describe("Munkatér a11y and overflow sweep", () => {
  test.setTimeout(240_000);
  test("main routes: axe 0 serious/critical, no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await switchPersona(page, "tulajdonos");
    const problems: string[] = [];
    for (const path of ROUTES) {
      await page.goto(path, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 0) problems.push(`${path}: overflow ${overflow}px`);
      const violations = await axeSeriousOrCritical(page);
      if (violations.length > 0) problems.push(`${path}: ${violations.join(" | ")}`);
    }
    expect(problems).toEqual([]);
  });

  test("detail and form routes: axe 0 serious/critical, no horizontal overflow", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto("/");
    await switchPersona(page, "vezeto");
    const problems: string[] = [];
    const check = async (path: string) => {
      await page.goto(path, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 0) problems.push(`${path}: overflow ${overflow}px`);
      const violations = await axeSeriousOrCritical(page);
      if (violations.length > 0) problems.push(`${path}: ${violations.join(" | ")}`);
    };

    // An event with one song, its detail, editor and projection controller.
    await page.goto("/munkater/esemenyek/uj");
    await page.getByLabel("Név").fill("Átvilágítási alkalom");
    await page.getByLabel("Kezdés").fill("2031-05-04T10:00");
    await page.getByRole("button", { name: "Esemény létrehozása" }).click();
    await page.waitForURL(/\/munkater\/esemenyek\/[0-9a-f-]{36}/);
    const eventId = /esemenyek\/([0-9a-f-]{36})/.exec(page.url())?.[1];
    expect(eventId).toBeTruthy();
    const add = page.getByRole("combobox", { name: "Programpont hozzáadása" });
    await add.fill("Áldás");
    await page.getByRole("option", { name: /Áldás, békesség/ }).click();
    await expect(page.getByText("Áldás, békesség").first()).toBeVisible();
    await check(`/munkater/esemenyek/${eventId}`);
    await check(`/munkater/esemenyek/${eventId}/szerkesztes`);
    await check(`/munkater/vetites?event=${eventId}`);

    // A song: detail pane and edit form.
    await page.goto("/munkater/enektar", { waitUntil: "networkidle" });
    const songId = await page.$$eval("a[href*='/enektar/']", (links) => {
      const href = links
        .map((a) => a.getAttribute("href") ?? "")
        .find((h) => /enektar\/[0-9a-f-]{36}/.test(h));
      return href ? /([0-9a-f-]{36})/.exec(href)?.[1] : undefined;
    });
    expect(songId).toBeTruthy();
    await check(`/munkater/enektar/${songId}`);
    await check(`/munkater/enektar/${songId}/szerkesztes`);

    // A course and its editor.
    await page.goto("/munkater/kepzesek");
    await page.getByRole("button", { name: "Új képzés" }).first().click();
    await page.getByLabel("Cím").fill("Átvilágítási képzés");
    await page.getByRole("button", { name: "Létrehozás" }).click();
    await page.waitForURL(/\/munkater\/kepzesek\/[0-9a-f-]{36}\/edit/);
    const courseId = /kepzesek\/([0-9a-f-]{36})/.exec(page.url())?.[1];
    await check(`/munkater/kepzesek/${courseId}/edit`);
    await check(`/munkater/kepzesek/${courseId}`);

    await check("/munkater/keverpult");
    await check("/munkater/biblia-forditasok");
    await check("/munkater/biblia-szoveg");
    await check("/munkater/esemenyek/csoportok");
    await check("/munkater/esemenyek/hirdetesek");
    await check("/munkater/esemenyek/naptar");
    expect(problems).toEqual([]);
  });
});
