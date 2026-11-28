import { expect, test } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phases 5d and 8b (push of live sessions, kinds of notification): the settings page. The demo has no VAPID keys, so
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
  // By keyboard: on a phone the page is long and the bottom menu can cover the box.
  await box.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("Elmentve.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Értesítés a közös alkalmak indulásáról")).not.toBeChecked();
});

test("the kinds of notification are saved and kept; the form has no time zone and no names", async ({
  page,
}) => {
  await page.goto("/");
  await switchPersona(page, "onkentes");
  await page.goto("/munkater/ertesitesek");
  await expect(page.getByLabel("Amikor felvesznek egy eseményre")).toBeChecked();
  await page.getByLabel("Nap az esemény előtt").fill("3");
  await page.getByLabel("Az eseményeim dallistája").uncheck();
  await page.getByRole("button", { name: "Értesítések mentése" }).click();
  await expect(page.getByText("Az értesítéseid mentve.").first()).toBeVisible();
  expect(await axeSeriousOrCritical(page)).toEqual([]);
  await expect(async () => {
    await page.reload();
    await expect(page.getByLabel("Nap az esemény előtt")).toHaveValue("3", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByLabel("Az eseményeim dallistája")).not.toBeChecked();
});

test("the service worker script is served for the workspace scope", async ({ page }) => {
  await page.goto("/");
  await switchPersona(page, "zenei");
  const response = await page.request.get("/munkater/sw.js");
  expect(response.status()).toBe(200);
  expect(response.headers()["service-worker-allowed"]).toBe("/munkater/");
  expect(await response.text()).toContain("showNotification");
});
