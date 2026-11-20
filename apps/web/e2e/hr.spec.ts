import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona, type PersonaKey } from "./demo-helpers";

async function as(page: Page, persona: PersonaKey, path: string) {
  await page.goto("/");
  await switchPersona(page, persona);
  await page.goto(path);
}

async function axe(page: Page) {
  expect(await axeSeriousOrCritical(page)).toEqual([]);
}

test.describe("HR requests (D-71, D-72)", () => {
  test("the HR handler sees the inbox, SLA badges and the dashboard", async ({ page }) => {
    await as(page, "hr", "/munkater/hr");
    await expect(page.getByTestId("hr-dashboard")).toBeVisible();
    await expect(page.getByTestId("hr-inbox").getByTestId("ticket-row").first()).toBeVisible();
    await expect(page.getByTestId("sla-badge").first()).toBeVisible();
    // Confidential titles never show in the handler inbox.
    await expect(page.getByTestId("hr-inbox")).not.toContainText("Bizalmas bejelentés");
    await axe(page);
  });

  test("a volunteer only gets the categories enabled for volunteers", async ({ page }) => {
    await as(page, "onkentes", "/munkater/hr/uj");
    await expect(page.getByTestId("category-card").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Szabadságkérelem" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Önkéntes szolgálat/ })).toHaveCount(1);
    await axe(page);
  });

  test("leave request: calculate, submit, approve through the chain, record the absence", async ({
    page,
  }) => {
    await as(page, "iroda", "/munkater/hr/uj?tipus=tavollet");
    await axe(page);
    await page.getByRole("link", { name: "Szabadságkérelem" }).click();
    await page.getByLabel("Első nap", { exact: true }).fill("2027-06-07");
    await page.getByLabel("Utolsó nap", { exact: true }).fill("2027-06-11");
    await expect(page.getByTestId("working-days-count")).toContainText("5");
    await page.getByLabel("Az utolsó nap fél nap").check();
    await expect(page.getByTestId("working-days-count")).toContainText("4,5");
    await axe(page);
    await page.getByTestId("form-submit").click();

    // Straight into the approval chain, with a reference number.
    await expect(page.getByTestId("hr-ticket")).toBeVisible();
    await expect(page.getByTestId("ticket-reference")).toHaveText(/^HR-\d{4}-\d{4}$/);
    await expect(page.getByTestId("ticket-status")).toHaveAttribute(
      "data-status",
      "jovahagyasra_var",
    );
    await expect(page.getByTestId("chain-step")).toHaveCount(2);
    // The requester cannot decide their own request.
    await expect(page.getByTestId("decision-form")).toHaveCount(0);
    await axe(page);
    const url = page.url().split("?")[0] as string;

    await switchPersona(page, "vezeto");
    await page.goto(url);
    await page.getByTestId("approve").click();
    await expect(page.getByTestId("chain-step").first()).toContainText("Jóváhagyva");
    await page.getByTestId("approve").click();
    await expect(page.getByTestId("ticket-status")).toHaveAttribute("data-status", "jovahagyva");
    await expect(page.getByTestId("ticket-absence")).toContainText("Rögzítve a naptárban");
    await expect(page.getByTestId("history")).toContainText("Jóváhagyva");

    await switchPersona(page, "hr");
    await page.goto(url);
    await page.getByTestId("close").click();
    await expect(page.getByTestId("ticket-status")).toHaveAttribute("data-status", "lezart");
  });

  test("a handler cannot handle their own request", async ({ page }) => {
    await as(page, "hr", "/munkater/hr");
    await page.getByTestId("hr-mine").getByTestId("ticket-row").first().getByRole("link").click();
    await expect(page.getByTestId("hr-ticket")).toBeVisible();
    await expect(page.getByTestId("close")).toHaveCount(0);
    await expect(page.getByTestId("take")).toHaveCount(0);
    await expect(page.getByTestId("decision-form")).toHaveCount(0);
  });

  test("handlers see internal notes with a label", async ({ page }) => {
    await as(page, "hr", "/munkater/hr");
    await page.getByRole("link", { name: /Munkaügyi kérdés/ }).click();
    await expect(page.getByTestId("internal-note")).toBeVisible();
    await expect(page.getByTestId("history")).toBeVisible();
    await axe(page);
  });
});

test.describe("Confidential tickets (D-74)", () => {
  test("only the named handler opens it, with a reason; others get 404", async ({ page }) => {
    await as(page, "bizalmas", "/munkater/hr");
    const row = page.getByTestId("ticket-row").filter({ hasText: "Bizalmas bejelentés" }).first();
    const href = (await row.getByRole("link").getAttribute("href")) as string;
    await page.goto(href);
    await expect(page.getByTestId("hr-gate")).toBeVisible();
    await expect(page.getByTestId("hr-ticket")).toHaveCount(0);
    await axe(page);
    await page.getByLabel("Betekintés oka").fill("Az ügy áttekintése a heti egyeztetés előtt");
    await page.getByTestId("reason-submit").click();
    await expect(page.getByTestId("hr-ticket")).toBeVisible();
    await expect(page.getByTestId("read-log")).toContainText("heti egyeztetés");
    await axe(page);

    for (const persona of ["hr", "vezeto"] as const) {
      await switchPersona(page, persona);
      const response = await page.goto(href);
      expect(response?.status()).toBe(404);
      await expect(page.getByTestId("hr-ticket")).toHaveCount(0);
      await expect(page.getByTestId("hr-gate")).toHaveCount(0);
    }
  });

  test("the reason is required", async ({ page }) => {
    await as(page, "bizalmas", "/munkater/hr");
    await page
      .getByTestId("ticket-row")
      .filter({ hasText: "Bizalmas bejelentés" })
      .first()
      .getByRole("link")
      .click();
    await page.getByTestId("reason-submit").click();
    await expect(page.getByTestId("hr-gate")).toBeVisible();
    await expect(page.getByText("Kérjük, írja le a betekintés okát")).toBeVisible();
  });

  test("an anonymous complaint stores no requester and shows an access code", async ({ page }) => {
    await as(page, "iroda", "/munkater/hr/uj");
    await page.getByRole("link", { name: "Bizalmas bejelentés" }).click();
    await page.getByLabel("A bejelentés tárgya").fill("Fiktív teszt bejelentés");
    await page.getByLabel("Névtelenül küldöm").check();
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("anonymous-code")).toContainText("HR-");
    await expect(page.getByTestId("anonymous-code")).toContainText(/\d{6}/);
  });
});

test.describe("Távollétek (D-73)", () => {
  test("grid, own balance, conflicts and axe", async ({ page }) => {
    await as(page, "iroda", "/munkater/tavollet");
    await expect(page.getByTestId("absence-page")).toBeVisible();
    await expect(page.getByTestId("leave-balance")).toBeVisible();
    await expect(page.getByTestId("leave-remaining")).toContainText("nap");
    await axe(page);
  });

  test("HR sees every balance, an employee only their own", async ({ page }) => {
    await as(page, "hr", "/munkater/tavollet");
    await expect(page.getByTestId("all-balances")).toBeVisible();
    await switchPersona(page, "iroda");
    await page.goto("/munkater/tavollet");
    await expect(page.getByTestId("all-balances")).toHaveCount(0);
  });
});
