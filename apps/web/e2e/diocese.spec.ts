import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona, type PersonaKey } from "./demo-helpers";

/**
 * Diocesan HR portal (D-84, D-85): dashboard, cross-parish inbox, ticket handling, linking and
 * delegation. Every test has its own demo session (fresh browser context).
 */

async function as(page: Page, persona: PersonaKey, path: string) {
  await page.goto("/");
  await switchPersona(page, persona);
  await page.goto(path);
}

async function axe(page: Page) {
  expect(await axeSeriousOrCritical(page)).toEqual([]);
}

const WORK_QUESTION = "Munkaügyi kérdés — heti óraszám";
const EXPENSES = "Költségtérítés — kottafénymásolás";

test.describe("Diocesan portal (D-85)", () => {
  test("the dashboard counts delegated tickets and shows the actor's scope", async ({ page }) => {
    await as(page, "egyhazmegyeiHr", "/egyhazmegye");
    await expect(page.getByTestId("portal-dashboard")).toBeVisible();
    await expect(page.locator('[data-figure="open"]')).toBeVisible();
    await expect(page.getByTestId("portal-by-parish")).toContainText("Szent Tivadar");
    await expect(page.getByTestId("scope-parish")).toHaveCount(1);
    // Sections come from can(): the admin sees all of them.
    const nav = page.getByTestId("workspace-nav");
    for (const label of ["Áttekintés", "Kérések", "Távollétek", "Jelentések", "Sablonok"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await axe(page);
  });

  test("the inbox lists delegated tickets only — never confidential or undelegated ones", async ({
    page,
  }) => {
    await as(page, "egyhazmegyeiHr", "/egyhazmegye/kerelmek");
    const inbox = page.getByTestId("portal-inbox");
    await expect(inbox).toContainText(WORK_QUESTION);
    await expect(inbox).toContainText(EXPENSES);
    await expect(inbox.getByTestId("ticket-parish").first()).toContainText("Szent Tivadar");
    await expect(inbox).not.toContainText("Bizalmas bejelentés");
    await expect(inbox).not.toContainText("Névtelen bejelentés");
    // Leave requests are not delegated by the demo parish.
    await expect(inbox).not.toContainText("Szabadságkérelem");
    await axe(page);

    await page.getByTestId("filter-status").getByRole("link", { name: "Lezárt" }).click();
    await expect(page.getByTestId("portal-count")).toContainText("0");
    expect((await page.request.get("/egyhazmegye/kerelmek/nincs-ilyen")).status()).toBe(404);
  });

  test("a handler replies, closes a ticket, and the parish sees the access", async ({ page }) => {
    await as(page, "egyhazmegyeiHr", "/egyhazmegye/kerelmek");
    await page.getByRole("link", { name: new RegExp(EXPENSES) }).click();
    await expect(page.getByTestId("portal-ticket")).toBeVisible();
    const reference = await page.getByTestId("ticket-reference").innerText();
    await expect(page.getByTestId("ticket-reference")).toHaveText(/^HR-\d{4}-\d{4}$/);
    await axe(page);

    await page
      .getByLabel("Üzenet", { exact: true })
      .fill("Az egyházmegyei szabályzat szerint rendben.");
    await page.getByRole("checkbox", { name: "Belső jegyzet" }).check();
    await page.getByTestId("reply-submit").click();
    await expect(page.getByTestId("message").last()).toContainText("Egyházmegye");
    await expect(page.getByTestId("internal-note")).toBeVisible();

    await page.getByTestId("close").click();
    await expect(page.getByTestId("ticket-status")).toHaveAttribute("data-status", "lezart");

    // The parish owner sees every diocesan access with the reference number only.
    await switchPersona(page, "tulajdonos");
    await page.goto("/admin/egyhazmegye");
    const rows = page.getByTestId("org-access-row");
    await expect(rows.filter({ hasText: reference }).first()).toBeVisible();
    await expect(page.getByTestId("org-access")).toContainText("lezárás");
    await expect(page.getByTestId("org-access")).not.toContainText("kottafénymásolás");
    await axe(page);
  });

  test("the handler persona sees only their category scope and no parish management", async ({
    page,
  }) => {
    await as(page, "egyhazmegyeiUgyintezo", "/egyhazmegye/kerelmek");
    await expect(page.getByTestId("portal-inbox")).toContainText(WORK_QUESTION);
    const nav = page.getByTestId("workspace-nav");
    await expect(nav.getByRole("link", { name: "Sablonok" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: /Kapcsolt/ })).toHaveCount(0);
    expect((await page.request.get("/egyhazmegye/plebaniak")).status()).toBe(404);
    await axe(page);
  });

  test("reports and absences show the linked parish without personal data", async ({ page }) => {
    await as(page, "egyhazmegyeiHr", "/egyhazmegye/jelentesek");
    await expect(page.getByTestId("portal-reports-table")).toContainText("Szent Tivadar");
    await axe(page);
    await page.goto("/egyhazmegye/tavollet");
    await expect(page.getByTestId("portal-absences")).toBeVisible();
    await axe(page);
  });
});

test.describe("Linking and delegation (D-84)", () => {
  test("revoking ends access at once; re-linking needs both sides and the parish's choice", async ({
    page,
  }) => {
    await as(page, "egyhazmegyeiHr", "/egyhazmegye/plebaniak");
    await expect(page.getByTestId("parish-row")).toHaveCount(3);
    const parish = page.locator('[data-parish="t-szenttivadar"]');
    await expect(parish).toHaveAttribute("data-link", "active");
    await expect(parish.getByTestId("delegated")).toContainText("Munkaügyi kérdés");
    await expect(parish.getByTestId("delegated")).not.toContainText("Szabadságkérelem");
    await axe(page);

    // The diocese ends the link: its tickets are gone on the next request.
    await parish.getByTestId("link-revoke").click();
    await expect(parish).toHaveAttribute("data-link", "revoked");
    await page.goto("/egyhazmegye/kerelmek");
    await expect(page.getByTestId("portal-count")).toContainText("0");

    // Inviting again is not enough: the parish owner has to approve and choose categories.
    await page.goto("/egyhazmegye/plebaniak");
    await parish.getByTestId("link-request").click();
    await expect(parish).toHaveAttribute("data-link", "requested");
    await expect(parish).toContainText("jóváhagyására vár");
    await page.goto("/egyhazmegye/kerelmek");
    await expect(page.getByTestId("portal-count")).toContainText("0");

    await switchPersona(page, "tulajdonos");
    await page.goto("/admin/egyhazmegye");
    await expect(page.getByTestId("org-link")).toHaveAttribute("data-status", "requested");
    await axe(page);
    const form = page.getByTestId("approve-form");
    // Delegate a single category; confidential ones are not preselected.
    await expect(form.getByLabel("Bizalmas bejelentés")).not.toBeChecked();
    await form.getByLabel("Munkaügyi kérdés").check();
    await form.getByLabel("Költségtérítés-igény").uncheck();
    await page.getByTestId("approve-form-submit").click();
    await expect(page.getByTestId("org-link")).toHaveAttribute("data-status", "active");

    await switchPersona(page, "egyhazmegyeiHr");
    await page.goto("/egyhazmegye/kerelmek");
    await expect(page.getByTestId("portal-inbox")).toContainText(WORK_QUESTION);
    await expect(page.getByTestId("portal-inbox")).not.toContainText(EXPENSES);
    await axe(page);
  });

  test("the parish can narrow the delegation and end the link itself", async ({ page }) => {
    await as(page, "tulajdonos", "/admin/egyhazmegye");
    const form = page.getByTestId("delegation-form");
    await form.getByLabel("Költségtérítés-igény").uncheck();
    await page.getByTestId("delegation-form-submit").click();
    await page.reload();
    await expect(
      page.getByTestId("delegation-form").getByLabel("Költségtérítés-igény"),
    ).not.toBeChecked();

    await switchPersona(page, "egyhazmegyeiHr");
    await page.goto("/egyhazmegye/kerelmek");
    await expect(page.getByTestId("portal-inbox")).not.toContainText(EXPENSES);

    await switchPersona(page, "tulajdonos");
    await page.goto("/admin/egyhazmegye");
    await page.getByTestId("link-revoke").click();
    await expect(page.getByTestId("admin-org-link")).toContainText("Nincs egyházmegyei kapcsolat");

    await switchPersona(page, "egyhazmegyeiHr");
    await page.goto("/egyhazmegye/kerelmek");
    await expect(page.getByTestId("portal-count")).toContainText("0");
  });
});
