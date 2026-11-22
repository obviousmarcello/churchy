import { expect, test } from "@playwright/test";
import { axeSeriousOrCritical, openDemoMenu } from "./demo-helpers";
import { gotoChurch } from "./site-helpers";

/** UX-06: platform landing page, church sites under /demo/<slug>, and the sign-in page. */

test.describe("landing page", () => {
  test("is the platform page with no demo bar and a Demo link in the footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("új weboldala");
    await expect(page.getByTestId("demo-banner")).toHaveCount(0);
    await expect(page.getByTestId("landing-example")).toHaveCount(3);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await openDemoMenu(page);
    await expect(page.getByTestId("demo-persona-switcher")).toBeVisible();
  });

  test("the field starts the wizard and the import runs at once", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Írja be a jelenlegi weboldalának címét").fill("pelda.example.test");
    await page.getByTestId("landing-start-button").click();
    await expect(page).toHaveURL(/\/uj-egyhaz\?cim=/);
    await expect(page.getByTestId("open-review")).toBeVisible({ timeout: 20_000 });
  });

  test("example cards open the church sites", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-example").first().getByRole("link").click();
    await expect(page).toHaveURL(/\/demo\/szent-tivadar$/);
  });
});

test.describe("church sites under /demo/<slug>", () => {
  test("links keep the prefix, term routes work, unknown slugs 404", async ({ page, request }) => {
    await gotoChurch(page, "reformed");
    await expect(page.getByTestId("demo-banner")).toBeVisible();
    const hrefs = await page
      .locator("main a[href^='/'], header a[href^='/']")
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    for (const h of hrefs) {
      if (h.startsWith("/belepes") || h.startsWith("/_next") || h.endsWith(".pdf")) continue;
      expect(h, h).toMatch(/^\/demo\/dunaligeti-reformatus/);
    }
    await gotoChurch(page, "reformed", "/istentiszteleti-rend");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect((await request.get("/demo/nincs-ilyen")).status()).toBe(404);
    const ics = await request.get("/demo/szent-tivadar/esemenyek.ics");
    expect(ics.status()).toBe(200);
    expect(ics.headers()["set-cookie"]).toBeUndefined();
    expect(await (await request.get("/demo/szent-tivadar/sitemap.xml")).text()).toContain(
      "/demo/szent-tivadar/hirek",
    );
  });

  test("home passes axe and offers Belépés", async ({ page }) => {
    await gotoChurch(page, "catholic");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await expect(page.getByTestId("footer-login")).toHaveAttribute(
      "href",
      "/belepes?egyhaz=szent-tivadar",
    );
  });
});

test.describe("login", () => {
  test("demo account signs in and lands in its area; wrong credentials fail", async ({ page }) => {
    await page.goto("/belepes");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByLabel("E-mail-cím").fill("nincs@pelda.hu");
    await page.getByLabel("Jelszó").fill("x");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toBeVisible();

    await page.getByText("Demo fiókok").first().click();
    await page
      .locator('[data-testid="demo-account-fill"][data-email="lajos.tulajdonos@pelda.hu"]')
      .click();
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByTestId("sign-out").click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("workspace and diocese accounts go to their areas", async ({ page }) => {
    for (const [email, url] of [
      ["peter.onkentes@pelda.hu", /\/munkater$/],
      ["dora.egyhazmegyei@pelda.hu", /\/egyhazmegye$/],
    ] as const) {
      await page.goto("/belepes");
      await page.getByLabel("E-mail-cím").fill(email);
      await page.getByLabel("Jelszó").fill("bármi");
      await page.getByTestId("login-submit").click();
      await expect(page).toHaveURL(url);
    }
  });
});
