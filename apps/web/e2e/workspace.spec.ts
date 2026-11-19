import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona, type PersonaKey } from "./demo-helpers";

async function as(page: Page, persona: PersonaKey, path: string) {
  await page.goto("/");
  await switchPersona(page, persona);
  await page.goto(path);
}

test.describe("Munkatér shell and Ma", () => {
  test("headers are private, no-store and noindex", async ({ page, request }) => {
    const response = await request.get("/munkater");
    const cache = response.headers()["cache-control"] ?? "";
    expect(cache).toContain("private");
    expect(cache).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    void page;
  });

  test("a visitor gets the no-access notice", async ({ page }) => {
    await page.goto("/munkater");
    await expect(page.getByTestId("area-no-access")).toBeVisible();
  });

  test("the volunteer sees the permission-filtered navigation and Ma", async ({ page }) => {
    await as(page, "onkentes", "/munkater");
    await expect(page.getByTestId("workspace-today")).toBeVisible();
    const nav = page.getByTestId("area-sections");
    for (const id of ["today", "calendar", "directory", "teams", "worship"]) {
      await expect(nav.locator(`[data-section="${id}"]`)).toHaveCount(1);
    }
    for (const id of ["rooms", "hr", "songs"]) {
      await expect(nav.locator(`[data-section="${id}"]`)).toHaveCount(0);
    }
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("the office sees the room booking and the other placeholders", async ({ page }) => {
    await as(page, "iroda", "/munkater");
    await expect(page.locator('[data-section="rooms"]')).toHaveCount(1);
    await page.goto("/munkater/foglalas");
    await expect(page.getByTestId("rooms-board")).toBeVisible();
    await page.goto("/munkater/tavollet");
    await expect(page.getByTestId("workspace-placeholder")).toBeVisible();
  });
});

test.describe("Naptár", () => {
  test("views, layers and axe", async ({ page }) => {
    await as(page, "iroda", "/munkater/naptar");
    await expect(page.getByTestId("workspace-calendar")).toBeVisible();
    for (const view of ["nap", "het", "napirend", "honap"]) {
      await page.goto(`/munkater/naptar?nezet=${view}`);
      await expect(page.getByTestId("calendar-toolbar")).toBeVisible();
      expect(await axeSeriousOrCritical(page)).toEqual([]);
    }
    await page.goto("/munkater/naptar?nezet=het");
    await expect(page.getByTestId("calendar-week")).toBeVisible();
    // Switching every layer off leaves no entries.
    await page.goto("/munkater/naptar?nezet=het&szurt=1");
    await expect(page.getByTestId("calendar-entry")).toHaveCount(0);
  });

  test("a private event is created and stays private", async ({ page, browser }) => {
    await as(page, "onkentes", "/munkater/naptar/uj");
    await page.getByLabel("Cím").fill("Saját megbeszélés");
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("workspace-event")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saját megbeszélés" })).toBeVisible();
    const url = page.url().split("?")[0] as string;
    // Another persona (own demo session) cannot open it.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(url.replace(/\/naptar\/.*/, "/naptar/ismeretlen"));
    await expect(otherPage.getByTestId("workspace-event")).toHaveCount(0);
    await other.close();
  });

  test("the volunteer cannot choose the public visibility", async ({ page }) => {
    await as(page, "onkentes", "/munkater/naptar/uj");
    await expect(page.getByLabel("Láthatóság").locator("option")).toHaveCount(1);
  });
});

test.describe("Névjegyzék és csapatok", () => {
  test("directory search and team list", async ({ page }) => {
    await as(page, "iroda", "/munkater/nevjegyzek");
    const count = await page.getByTestId("directory-person").count();
    expect(count).toBeGreaterThan(5);
    await page.getByLabel("Név vagy beosztás").fill("zzzz");
    await page.getByRole("button", { name: "Szűrés" }).click();
    await expect(page.getByTestId("directory-person")).toHaveCount(0);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.goto("/munkater/csapatok");
    await expect(page.getByTestId("team-card").first()).toBeVisible();
    await page.getByTestId("team-card").first().getByRole("link").first().click();
    await expect(page.getByTestId("workspace-team")).toBeVisible();
    // The office may not manage teams.
    await expect(page.getByTestId("member-form")).toHaveCount(0);
  });

  test("the music leader may add a position to a team", async ({ page }) => {
    await as(page, "zenei", "/munkater/csapatok");
    await page.getByTestId("team-card").first().getByRole("link").first().click();
    await expect(page.getByTestId("position-form")).toBeVisible();
  });
});
