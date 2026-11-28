import { expect, test } from "@playwright/test";

test("home page renders in Hungarian with a skip link", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "hu");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ugrás a tartalomra" })).toBeAttached();
  await expect(page.getByRole("main")).toBeVisible();
});
