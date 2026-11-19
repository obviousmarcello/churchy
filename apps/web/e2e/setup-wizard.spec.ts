import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

/**
 * D-34 [UI]: the first-setup wizard. The client pastes the address of their old website, the mock
 * import job (no network) runs through its stages while the builder animation plays, and the
 * owner reviews the draft site, picks workspace modules, invites people and lands on a checklist
 * that links into the admin. Demo data is fictitious.
 */

const NO_DEMO = `http://localhost:${process.env.NO_DEMO_PORT ?? 3102}`;

async function runImport(page: Page, address = "pelda.example.test") {
  await page.getByLabel("A jelenlegi weboldal címe").fill(address);
  await page.getByRole("button", { name: "Beállítás indítása" }).click();
  // The stages are announced in a live region while they run.
  await expect(page.getByTestId("progress-live")).toContainText(/…|elérhető|beolvasva/);
  await expect(page.getByTestId("open-review")).toBeVisible({ timeout: 20_000 });
}

test.describe("setup wizard: public entry", () => {
  test("happy path: import, review, modules, invitations, checklist", async ({ page }) => {
    await page.goto("/uj-egyhaz");
    await expect(page.getByRole("heading", { level: 1, name: "Első beállítás" })).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // 1 · the import with its animation and stage list.
    await runImport(page);
    await expect(page.getByTestId("setup-builder")).toHaveAttribute("data-pieces", "7");
    await expect(page.getByTestId("setup-builder")).toHaveAttribute("data-done", "true");
    await expect(page.locator('[data-stage="draft"]')).toHaveAttribute("data-state", "done");
    await expect(page.getByTestId("progress-live")).toContainText("Minden lépés kész");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByTestId("open-review").click();

    // 2 · the draft site: summary and preview.
    await expect(
      page.getByRole("heading", { level: 2, name: "Az új oldal vázlata" }),
    ).toBeFocused();
    const preview = page.getByTestId("draft-preview");
    await expect(preview.locator('[data-preview="name"]')).toHaveText("Szilvásréti Gyülekezet");
    // Terms follow the preset: the Baptist church has "Alkalmaink", not a Catholic Mass schedule.
    await expect(preview.locator('[data-preview="services"]')).toContainText("Alkalmaink");
    await expect(preview.locator('[data-preview="services"]')).toContainText("Vasárnap");
    await expect(preview.locator('[data-preview="services"]')).toContainText("10:00");
    await expect(preview.locator('[data-preview="staff"]')).toHaveCount(0);

    // Low-confidence items are flagged; an edit or a confirmation clears the flag.
    const flagged = page.locator('[data-flagged="true"]');
    await expect(flagged).toHaveCount(5);
    await expect(page.getByText("5 elemet érdemes ellenőriznie")).toBeVisible();
    await page.getByLabel("Időpont").nth(2).fill("19:30");
    await expect(flagged).toHaveCount(4);
    await expect(preview.locator('[data-preview="services"]')).toContainText("19:30");
    await page
      .locator('[data-review-item="tagline"]')
      .getByRole("button", { name: "Rendben, megerősítem" })
      .click();
    await expect(flagged).toHaveCount(3);

    // Editing the name shows in the preview at once.
    await page.getByLabel("Rövid név").fill("Szilvásréti Közösség");
    await expect(preview.locator('[data-preview="name"]')).toHaveText("Szilvásréti Közösség");

    // A person is taken over only by opt-in and with the rights confirmation.
    const person = page.locator('[data-person="p-1"]');
    await person.getByLabel("Név és beosztás átvétele").check();
    await expect(page.getByTestId("review-next")).toBeDisabled();
    await expect(page.getByText("Erősítse meg minden átvett munkatárs")).toBeVisible();
    await expect(preview.locator('[data-preview="staff"]')).toHaveCount(0);
    await person.getByLabel(/Megerősítem, hogy Mintás Gergely hozzájárult/).check();
    await expect(page.getByTestId("review-next")).toBeEnabled();
    await expect(preview.locator('[data-preview="staff"]')).toContainText("Mintás Gergely");
    await expect(page.locator('[data-person="p-2"]').getByLabel("Fénykép átvétele")).toHaveCount(0);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByTestId("review-next").click();

    // 3 · workspace modules (entitlements-style toggles).
    await expect(page.getByRole("heading", { level: 2, name: "Belső munkatér" })).toBeFocused();
    await expect(page.locator('[data-module="calendar"] input')).toBeChecked();
    await expect(page.locator('[data-module="hr"] input')).not.toBeChecked();
    await page.locator('[data-module="hr"] input').check();
    await expect(page.getByText("Éles használat csak biztonsági átvétel után")).toBeVisible();
    await page.locator('[data-module="rooms"] input').uncheck();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByTestId("modules-next").click();

    // 4 · invitations (nothing is sent) and settings.
    await page.getByLabel("E-mail-cím", { exact: true }).first().fill("nem-cim");
    await page.getByRole("button", { name: "Hozzáadás" }).click();
    await expect(page.getByText("Adjon meg érvényes e-mail-címet.")).toBeVisible();
    await page
      .getByLabel("E-mail-cím", { exact: true })
      .first()
      .fill("ilona.minta@pelda.example.test");
    await page.getByLabel("Szerepkör").selectOption("editor");
    await page.getByRole("button", { name: "Hozzáadás" }).click();
    await expect(page.getByTestId("invite-list")).toContainText("ilona.minta@pelda.example.test");
    await expect(page.getByTestId("invite-list")).toContainText("Szerkesztő");
    // The room manager role is gone with the room booking module.
    await expect(
      page.getByLabel("Szerepkör").locator("option", { hasText: "Teremfelelős" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Értesítések e-mail-címe")).toHaveValue(
      "iroda@szilvasret-gyulekezet.example.test",
    );
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByTestId("invites-next").click();

    // 5 · done: the checklist with links into the admin.
    await expect(page.getByTestId("setup-done")).toBeVisible();
    await expect(page.getByTestId("checklist").locator("li")).toHaveCount(9);
    await expect(page.locator('[data-item="users"]')).toHaveAttribute("data-done", "true");
    await expect(page.locator('[data-item="launch"]')).toHaveAttribute("data-done", "false");
    await expect(page.locator('[data-item="schedule"] a')).toHaveAttribute("href", "/admin/rend");
    await expect(page.getByTestId("open-admin")).toHaveAttribute("href", "/admin");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("an address that is not a web address is refused without starting", async ({ page }) => {
    await page.goto("/uj-egyhaz");
    await page.getByLabel("A jelenlegi weboldal címe").fill("nem cím");
    await page.getByRole("button", { name: "Beállítás indítása" }).click();
    await expect(page.getByText(/Ez nem tűnik weboldal-címnek/)).toBeVisible();
    await expect(page.getByTestId("setup-builder")).toHaveAttribute("data-pieces", "0");
  });

  test("with reduced motion the pieces just appear and nothing animates", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/uj-egyhaz");
    await runImport(page, "https://pelda.example.test/rolunk");
    const robot = page.getByTestId("setup-builder").locator("g[class*='robot']").first();
    expect(await robot.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    const piece = page.locator('[data-piece="pages"]');
    expect(await piece.evaluate((el) => getComputedStyle(el).transitionProperty)).not.toContain(
      "transform",
    );
    await expect(piece).toHaveAttribute("data-on", "true");
  });

  test("the import never reaches the network: any address gives the scripted result", async ({
    page,
  }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith("http://localhost")) external.push(r.url());
    });
    await page.goto("/uj-egyhaz");
    await runImport(page, "https://ez-sem-letezik.example.invalid");
    expect(external).toEqual([]);
  });

  test("does not exist outside demo mode", async ({ request }) => {
    expect((await request.get(`${NO_DEMO}/uj-egyhaz`)).status()).toBe(404);
    expect((await request.get(`${NO_DEMO}/uj-egyhaz/import?url=pelda.example.test`)).status()).toBe(
      404,
    );
  });
});

test.describe("setup wizard: in the admin", () => {
  test("is a section for the owner only and runs inside the admin shell", async ({ page }) => {
    await page.goto("/admin/inditas");
    await expect(page.getByTestId("area-no-access")).toBeVisible();
    await page.goto("/");
    await switchPersona(page, "szerkeszto");
    await page.goto("/admin/inditas");
    await expect(page.getByTestId("area-no-access")).toBeVisible();

    await switchPersona(page, "tulajdonos");
    await page.goto("/admin/inditas");
    await expect(page.getByTestId("admin-setup")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Lépések" })).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await runImport(page);
    await page.getByTestId("open-review").click();
    await expect(page.getByTestId("draft-preview")).toBeVisible();
  });
});
