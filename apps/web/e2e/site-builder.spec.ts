import { expect, test, type Page } from "@playwright/test";
import {
  axeSeriousOrCritical,
  currentPersona,
  openDemoMenu,
  optionName,
  personaSwitcher,
  switchPersona,
} from "./demo-helpers";

/**
 * Site builder (D-34, operators only): the URL -> draft site agent in demo mode. The pipeline runs
 * on the fixture church (fictitious pages served from memory) with a fake model: no network, no key.
 */

const OPERATOR = "Üzemeltető (Churchy)";

async function becomeOperator(page: Page) {
  await page.goto("/");
  await openDemoMenu(page);
  await personaSwitcher(page)
    .getByRole("button", { name: optionName(OPERATOR) })
    .click();
  await expect(currentPersona(page)).toHaveText(OPERATOR);
}

async function build(page: Page, existing = false) {
  await page.goto("/platform/webhely-epito");
  await page.getByLabel("A jelenlegi weboldal címe").fill("https://valodi-egyhaz.example.hu");
  if (existing) {
    await page.getByLabel("Meglévő egyház (a tulajdonos alkalmazza)").check();
    await page
      .getByLabel("Az egyház", { exact: true })
      .selectOption({ label: "Szent Tivadar Plébánia" });
  }
  await page.getByLabel("Az egyház kérte, hogy ebből a címből készítsük el a weboldalát.").check();
  await page.getByTestId("site-builder-start").click();
  await expect(page).toHaveURL(/\/platform\/webhely-epito\/[\w-]+$/, { timeout: 30_000 });
  await expect(page.getByTestId("draft-review")).toBeVisible();
}

test.describe("site builder (operators)", () => {
  test("does not exist for visitors and church owners", async ({ page }) => {
    expect((await page.goto("/platform/webhely-epito"))?.status()).toBe(404);
    await page.goto("/");
    await switchPersona(page, "tulajdonos");
    expect((await page.goto("/platform/webhely-epito"))?.status()).toBe(404);
    const res = await page.request.post("/platform/webhely-epito/epit", {
      data: { url: "https://x.example.hu", consent: true },
    });
    expect(res.status()).toBe(403);
  });

  test("the form needs the consent, runs the build and opens the review", async ({ page }) => {
    await becomeOperator(page);
    await page.goto("/platform/webhely-epito");
    await expect(page.getByRole("heading", { level: 1, name: "Weboldal-építő" })).toBeVisible();
    await expect(page.getByTestId("site-builder-demo-notice")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // no consent: nothing starts
    await page.getByLabel("A jelenlegi weboldal címe").fill("https://valodi-egyhaz.example.hu");
    await page.getByTestId("site-builder-start").click();
    await expect(page.getByText("Jelöld be, hogy az egyház kérte")).toBeVisible();
    await expect(page).toHaveURL(/\/platform\/webhely-epito$/);

    await build(page);
    await expect(page.getByTestId("draft-page")).toHaveCount(1);
    await expect(page.getByTestId("draft-post")).toHaveCount(1);
    await expect(page.getByTestId("draft-service-time")).toHaveCount(2);
    await expect(page.getByTestId("draft-review")).toContainText(
      "Mintavárosi Szent Példa Plébánia",
    );
    await expect(page.getByTestId("draft-review")).toContainText("Hozzájárulás rögzítve");
    // private data of the fixture pages never reaches the draft
    const text = (await page.getByTestId("draft-review").textContent()) ?? "";
    expect(text).not.toMatch(/pal\.pelda|555 0123|súlyosan beteg|Kovács Anna/);
    // the personal-data removal is reported; every item links to its source
    await expect(page.getByTestId("draft-warnings")).toContainText("személyes adatot");
    await expect(
      page.getByTestId("draft-page").getByRole("link", { name: /Megnyitás/ }),
    ).toHaveAttribute("href", /plebania\.example\.hu\/rolunk$/);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("items can be switched off and the choice is saved", async ({ page }) => {
    await becomeOperator(page);
    await build(page);
    await page.getByTestId("draft-post").getByRole("checkbox").uncheck();
    await page.getByTestId("draft-save").click();
    await expect(page.getByTestId("draft-message")).toContainText("elmentettük");
    await page.reload();
    await expect(page.getByTestId("draft-post").getByRole("checkbox")).not.toBeChecked();
  });

  test("a new church is created from the draft", async ({ page }) => {
    await becomeOperator(page);
    await build(page);
    await page.getByLabel("Az egyház neve").fill("Mintavárosi Plébánia");
    await page.getByLabel("Webcím-azonosító").fill("mintavaros");
    await page
      .getByLabel("A tulajdonos felhasználói azonosítója")
      .fill("22222222-2222-4222-8222-222222222222");
    await page.getByLabel("A tulajdonos e-mail-címe").fill("owner@example.test");
    await page.getByLabel("A tulajdonos neve").fill("Minta Mihály");
    await page.getByTestId("draft-apply").click();
    await expect(page.getByTestId("draft-applied")).toContainText("Alkalmazva: 1 oldal, 1 hír");
  });

  test("a draft for an existing church waits for its owner, who applies it", async ({ page }) => {
    await becomeOperator(page);
    await build(page, true);
    await expect(page.getByTestId("draft-existing")).toBeVisible();

    await page.goto("/");
    await switchPersona(page, "tulajdonos");
    await page.goto("/admin/inditas");
    await expect(page.getByTestId("owner-drafts")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByTestId("owner-draft-apply").first().click();
    await expect(page.getByTestId("owner-draft-result").first()).toContainText(
      "Alkalmaztuk: 1 oldal",
    );
  });
});
