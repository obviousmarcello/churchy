import { expect, test, type Page } from "@playwright/test";
import {
  CHURCHES,
  axeSeriousOrCritical,
  switchContext,
  switchPersona,
  type PersonaKey,
} from "./demo-helpers";

/**
 * D-26 users & roles, D-25 module toggles, D-87 plans & entitlements, D-88 billing (demo depth).
 * Everything runs against the mock adapter with fictitious data; the Barion step is a fictitious
 * confirmation page without payment code.
 */

async function as(page: Page, persona: PersonaKey, path: string, church?: string) {
  await page.goto("/");
  await switchPersona(page, persona);
  if (church !== undefined) await switchContext(page, church);
  await page.goto(path);
}

test.describe("Felhasználók és szerepkörök (D-26)", () => {
  test("list, axe, and the last owner cannot be suspended", async ({ page }) => {
    await as(page, "tulajdonos", "/admin/felhasznalok");
    await expect(page.getByTestId("users-table")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    // The owner is the only active owner: the suspend button is disabled and explained.
    const ownerRow = page.getByRole("row").filter({ hasText: "Tulajdonos" }).first();
    await expect(ownerRow.getByTestId("member-deactivate")).toBeDisabled();
    await expect(ownerRow).toContainText("utolsó aktív tulajdonos");
  });

  test("invite, change role, suspend and restore", async ({ page }, testInfo) => {
    await as(page, "tulajdonos", "/admin/felhasznalok/uj");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    // Neither a website nor a workspace role: refused in Hungarian.
    await page.getByLabel("Név").fill("Próba Pál");
    await page.getByLabel("E-mail-cím").fill("proba.pal@pelda.example");
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("form-errors")).toBeVisible();
    // With a role the invitation goes through.
    await page.getByLabel("Weboldali szerepkör").selectOption("editor");
    await page.getByTestId("form-submit").click();
    await expect(page).toHaveURL(/\/admin\/felhasznalok\?mentve=1/);
    const row = page.getByRole("row").filter({ hasText: "Próba Pál" });
    await expect(row).toContainText("Szerkesztő");
    await expect(row.getByTestId("member-state")).toHaveAttribute("data-state", "invited");

    // Inviting the same address again is refused.
    await page.goto("/admin/felhasznalok/uj");
    await page.getByLabel("Név").fill("Próba Pál");
    await page.getByLabel("E-mail-cím").fill("proba.pal@pelda.example");
    await page.getByLabel("Weboldali szerepkör").selectOption("office");
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("form-errors")).toBeVisible();
    await expect(page.getByText("Ez az e-mail-cím már szerepel")).toBeVisible();

    // Change the role.
    await page.goto("/admin/felhasznalok");
    // (Followed by address: on a phone the sticky header can cover a link in a long table.)
    const editHref = await row.getByRole("link", { name: /^Szerkesztés: / }).getAttribute("href");
    await page.goto(editHref ?? "/admin/felhasznalok");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByLabel("Weboldali szerepkör").selectOption("office");
    await page.getByTestId("form-submit").click();
    await expect(page.getByRole("row").filter({ hasText: "Próba Pál" })).toContainText("Iroda");

    // Suspending runs on desktop only: the long table scrolls sideways on a phone.
    if (testInfo.project.name === "mobile") return;
    // Suspend (asks first), then restore.
    await page
      .getByRole("row")
      .filter({ hasText: "Próba Pál" })
      .getByTestId("member-deactivate")
      .dispatchEvent("click");
    await page.getByTestId("member-active-confirm").click();
    const suspended = page.getByRole("row").filter({ hasText: "Próba Pál" });
    await expect(suspended.getByTestId("member-state")).toHaveAttribute("data-state", "inactive");
    await suspended.getByTestId("member-activate").dispatchEvent("click");
    await page.getByTestId("member-active-confirm").click();
    await expect(
      page.getByRole("row").filter({ hasText: "Próba Pál" }).getByTestId("member-state"),
    ).toHaveAttribute("data-state", "invited");
  });

  test("an editor has no user management", async ({ page }) => {
    await as(page, "szerkeszto", "/admin/felhasznalok");
    await expect(page.getByTestId("area-no-access")).toBeVisible();
    await expect(page.getByTestId("users-table")).toHaveCount(0);
  });
});

test.describe("Modulok (D-25)", () => {
  test("switching a module off hides its nav item and page, on restores both", async ({ page }) => {
    await as(page, "tulajdonos", "/admin/modulok");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    const news = page.getByLabel("Hírek", { exact: true });
    await expect(news).toBeChecked();
    await news.uncheck();
    await page.getByTestId("form-submit").click();
    await expect(page).toHaveURL(/\/admin\/modulok\?mentve=1/);
    await expect(page.getByLabel("Hírek", { exact: true })).not.toBeChecked();

    // The public site: no nav item, the route answers 404.
    const gone = await page.goto("/hirek");
    expect(gone?.status()).toBe(404);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Hírek", exact: true })).toHaveCount(0);

    // Back on: everything returns, content intact.
    await page.goto("/admin/modulok");
    await page.getByLabel("Hírek", { exact: true }).check();
    await page.getByTestId("form-submit").click();
    await expect(page.getByLabel("Hírek", { exact: true })).toBeChecked();
    const back = await page.goto("/hirek");
    expect(back?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("modules outside the plan are listed locked", async ({ page }) => {
    await as(page, "tulajdonos", "/admin/modulok");
    // The Catholic demo parish has the workspace M tier: the board module is not included.
    await expect(page.getByTestId("modules-locked")).toContainText("Hirdetőtábla");
    await expect(page.getByTestId("modules-locked")).toContainText("Nem része a csomagnak");
  });
});

test.describe("Csomag (D-87)", () => {
  test("overview with limits, module availability and catalog", async ({ page }) => {
    await as(page, "tulajdonos", "/admin/csomag");
    await expect(page.getByTestId("plan-website-name")).toHaveText("Teljes");
    await expect(page.getByTestId("plan-workspace-name")).toContainText("Munkatér M");
    await expect(page.getByTestId("plan-limit").first()).toBeVisible();
    await expect(page.getByTestId("plan-modules")).toContainText("Nem része a csomagnak");
    // The parish's plan is covered by the diocesan deal: no self-service change.
    await expect(page.getByText("A csomagot az egyházmegyei megállapodás fedezi")).toBeVisible();
    await expect(page.getByTestId("plan-downgrade")).toHaveCount(0);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("a downgrade keeps the content, hides paid modules and shows the upgrade prompts", async ({
    page,
  }) => {
    await as(page, "tulajdonos", "/admin/csomag", CHURCHES.reformed);
    await expect(page.getByTestId("plan-website-name")).toHaveText("Teljes");
    await page.getByRole("button", { name: "Váltás a(z) Ingyenes csomagra" }).click();
    await expect(page.getByText("Nem törlődik tartalom")).toBeVisible();
    await page.getByTestId("plan-change-confirm").click();
    await expect(page.getByTestId("plan-website-name")).toHaveText("Ingyenes");
    await expect(page.getByTestId("plan-workspace-name")).toHaveText("Nincs munkatér");
    await expect(page.getByTestId("plan-features")).toContainText("Nem része a csomagnak");
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Paid modules are locked in the toggles, not deleted.
    await page.goto("/admin/modulok");
    await expect(page.getByTestId("modules-locked")).toContainText("Képtár");

    // And back up again.
    await page.goto("/admin/csomag");
    await page.getByRole("button", { name: "Váltás a(z) Teljes csomagra" }).click();
    await page.getByTestId("plan-change-confirm").click();
    await expect(page.getByTestId("plan-website-name")).toHaveText("Teljes");
  });
});

test.describe("Számlázás (D-88, bemutató)", () => {
  test("invoices, billing details and the fictitious Barion step", async ({ page }) => {
    await as(page, "tulajdonos", "/admin/szamlazas", CHURCHES.reformed);
    await expect(page.getByTestId("invoice-table")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Billing details: invalid tax number is refused in Hungarian, a valid one is saved.
    await page.getByLabel("Adószám").fill("123");
    await page.getByTestId("form-submit").click();
    await expect(page.getByText("Az adószám formátuma")).toBeVisible();
    await page.getByLabel("Adószám").fill("12345678-1-42");
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("saved-notice")).toBeVisible();

    // The pay button leads to a fictitious page and a fictitious confirmation: nothing changes.
    await page.getByTestId("pay-barion").first().click();
    await expect(page.getByTestId("barion-mock")).toContainText("nem a valódi Barion oldal");
    await expect(page.getByLabel(/kártya/i)).toHaveCount(0);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByTestId("barion-confirm").click();
    await expect(page.getByTestId("barion-done")).toContainText("nem történt valódi fizetés");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("the diocesan parish has no own billing; the editor sees nothing", async ({ page }) => {
    await as(page, "tulajdonos", "/admin/szamlazas");
    await expect(page.getByTestId("billing-covered")).toBeVisible();
    await page.goto("/");
    await switchPersona(page, "szerkeszto");
    await page.goto("/admin/szamlazas");
    await expect(page.getByTestId("area-no-access")).toBeVisible();
  });
});
