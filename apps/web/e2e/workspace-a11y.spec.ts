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
});
