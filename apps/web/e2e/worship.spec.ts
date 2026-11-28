import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona, type PersonaKey } from "./demo-helpers";

async function as(page: Page, persona: PersonaKey, path: string) {
  await page.goto("/");
  await switchPersona(page, persona);
  await page.goto(path);
}

test.describe("Liturgia", () => {
  test("list, plan editor, status flow and comments", async ({ page }) => {
    await as(page, "zenei", "/munkater/liturgia");
    await expect(page.getByTestId("worship-page")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Create a plan from a template for the first service without one.
    await page.getByTestId("plan-create").first().click();
    await expect(page.getByTestId("plan-page")).toBeVisible();
    await expect(page.getByTestId("plan-status")).toHaveText("Tervezet");
    const items = page.getByTestId("plan-item");
    const count = await items.count();
    expect(count).toBeGreaterThan(3);
    await expect(page.getByTestId("plan-total")).toContainText("Összesen:");

    // Reorder with the buttons, add an item, save.
    const first = await items.nth(0).getByTestId("plan-item-title").textContent();
    await items.nth(0).getByTestId("item-down").click();
    await expect(items.nth(1).getByTestId("plan-item-title")).toHaveText(first ?? "");
    await page.getByTestId("item-add").click();
    await expect(items).toHaveCount(count + 1);
    await page.getByTestId("plan-save").click();
    await expect(page.getByTestId("plan-save-status")).toHaveText("Mentve");
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Comment, then send to review.
    await page.getByLabel("Új megjegyzés").fill("Kérem, nézzék át a hangnemeket.");
    await page.getByTestId("comment-add").click();
    await expect(page.getByTestId("plan-comment")).toHaveCount(1);
    await page.getByTestId("plan-submit").click();
    await expect(page.getByTestId("plan-status")).toHaveText("Véleményezés alatt");
    const url = page.url();

    // The leader approves.
    await switchPersona(page, "vezeto");
    await page.goto(url);
    await page.getByTestId("plan-approve").click();
    await expect(page.getByTestId("plan-status")).toHaveText("Jóváhagyva");
  });

  test("a volunteer sees only the plans they serve in; templates page", async ({ page }) => {
    await as(page, "onkentes", "/munkater/liturgia");
    await expect(page.getByTestId("worship-page")).toBeVisible();
    await expect(page.getByTestId("plan-create")).toHaveCount(0);
    await page.goto("/munkater/liturgia/sablonok");
    await expect(page.getByTestId("template").first()).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("approved plan edits show the change summary", async ({ page }) => {
    await as(page, "zenei", "/munkater/liturgia?allapot=approved");
    const link = page.getByTestId("plan-row").first().getByRole("link");
    if ((await link.count()) === 0) test.skip();
    await link.click();
    await page.getByTestId("item-down").first().click();
    await page.getByTestId("plan-save").click();
    await expect(page.getByTestId("plan-save-status")).toHaveText("Mentve");
    await expect(page.getByTestId("plan-diff")).toBeVisible();
  });
});
