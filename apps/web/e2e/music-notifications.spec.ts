import { expect, test } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 5d (push of live sessions): the settings page. The demo has no VAPID keys, so
// push is off there and the page says so; the preference is stored per user.

test("the notification page says push is off in the demo and keeps the preference", async ({
  page,
}) => {
  await page.goto("/");
  await switchPersona(page, "zenei");
  await page.goto("/munkater/ertesitesek");
  await expect(page.getByRole("heading", { level: 1, name: "Értesítések" })).toBeVisible();
  await expect(
    page.getByText("Az értesítések ezen a telepítésen nincsenek bekapcsolva (demó)."),
  ).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);

  const box = page.getByLabel("Értesítés a közös alkalmak indulásáról");
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(page.getByText("Elmentve.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Értesítés a közös alkalmak indulásáról")).not.toBeChecked();
});

test("the service worker script is served for the workspace scope", async ({ page }) => {
  await page.goto("/");
  await switchPersona(page, "zenei");
  const response = await page.request.get("/munkater/sw.js");
  expect(response.status()).toBe(200);
  expect(response.headers()["service-worker-allowed"]).toBe("/munkater/");
  expect(await response.text()).toContain("showNotification");
});
