import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona, type PersonaKey } from "./demo-helpers";

/**
 * D-22 [UI] (schedule editor with preview and exceptions) and D-23 [UI] (denomination presets and
 * terminology overrides). Demo data lives in the visitor's own session, so every test starts from
 * the seed.
 */

async function openAs(page: Page, persona: PersonaKey) {
  await page.goto("/");
  await switchPersona(page, persona);
}

/** The next Sunday after today as `YYYY-MM-DD` (Europe/Budapest, like the browser). */
function nextSunday(): string {
  const now = new Date();
  const budapest = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Budapest" }));
  budapest.setDate(budapest.getDate() + (7 - budapest.getDay()) || 7);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${budapest.getFullYear()}-${p(budapest.getMonth() + 1)}-${p(budapest.getDate())}`;
}

test.describe("schedule: access", () => {
  test("the office may edit the schedule, the editor role may not", async ({ page }) => {
    await openAs(page, "szerkeszto");
    for (const path of ["/admin/rend", "/admin/rend/kivetel"]) {
      await page.goto(path);
      await expect(page.getByTestId("area-no-access")).toBeVisible();
      await expect(page.getByTestId("schedule-editor")).toHaveCount(0);
    }
    await switchPersona(page, "iroda");
    await page.goto("/admin/rend");
    await expect(page.getByTestId("schedule-editor")).toBeVisible();
    await page.goto("/admin/rend/kivetel");
    await expect(page.getByTestId("exception-flow")).toBeVisible();
  });
});

test.describe("schedule: weekly editor", () => {
  test("previews the next 8 weeks with the change highlighted, then saves to the public page", async ({
    page,
  }) => {
    await openAs(page, "iroda");
    await page.goto("/admin/rend");
    await expect(page.getByTestId("rules-save")).toBeDisabled();
    await expect(page.getByTestId("preview-changes")).toContainText("nincs hatása");

    await page.getByTestId("add-rule-6").click();
    const row = page.locator('[data-weekday="6"]').getByTestId("rule-row").last();
    await row.getByLabel("Időpont").fill("17:35");
    await expect(page.getByTestId("preview-changes")).toContainText("8 új");
    await expect(page.getByTestId("preview-added")).toBeVisible();

    // The preview week list is the public component, with the new services marked.
    await page.getByTestId("preview-week").selectOption("1");
    await expect(
      page.getByTestId("preview-week-view").locator('[data-changed="true"]').first(),
    ).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await page.getByTestId("rules-save").click();
    await expect(page.getByText("A rend mentve")).toBeVisible();
    await expect(page.getByTestId("rules-save")).toBeDisabled();

    await page.goto("/miserend");
    await expect(page.getByText("17:35").first()).toBeVisible();
  });

  test("blocks a bad time and shows the problem on the row", async ({ page }) => {
    await openAs(page, "iroda");
    await page.goto("/admin/rend");
    await page.getByTestId("add-rule-3").click();
    const row = page.locator('[data-weekday="3"]').getByTestId("rule-row").last();
    await row.getByLabel("Időpont").fill("");
    await page.getByTestId("rules-save").dispatchEvent("click");
    await expect(page.getByText("Javítsa a jelölt hibákat")).toBeVisible();
  });

  test("adds a seasonal period with dates and priority", async ({ page }) => {
    await openAs(page, "iroda");
    await page.goto("/admin/rend");
    await page.getByTestId("period-new").click();
    const form = page.getByTestId("period-form");
    await form.getByLabel("Időszak neve").fill("Adventi rend");
    await form.getByLabel(/Kezdete/).fill("2026-11-29");
    await form.getByLabel(/Vége/).fill("2026-12-24");
    await form.getByLabel("Elsőbbség", { exact: true }).fill("30");
    await page.getByTestId("period-save").click();
    await expect(page.getByTestId("period-form")).toHaveCount(0);
    await expect(page.getByTestId("schedule-period")).toHaveValue(/.+/);
    await expect(
      page.getByRole("heading", { level: 3, name: "Adventi rend", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("period-validity")).toContainText("nov. 29.");
  });
});

test.describe("schedule: exceptions", () => {
  test("cancel a service with a reason: preview, save, public schedule", async ({ page }) => {
    const date = nextSunday();
    await openAs(page, "iroda");
    await page.goto("/admin/rend/kivetel");
    await page.getByLabel("Nap", { exact: true }).fill(date);
    const services = page.getByTestId("exception-services").getByRole("checkbox");
    await expect(services.first()).toBeVisible();
    await services.first().check();
    await page.getByLabel(/^Ok/).fill("Búcsú ünnepe");
    await expect(
      page.getByTestId("exception-result").locator('[data-badge="exception"]'),
    ).toContainText("Elmarad");
    await page.getByTestId("exception-save").click();
    await expect(page.getByTestId("exception-feedback")).toContainText("mentve");
    await expect(page.getByTestId("upcoming-exceptions")).toContainText("Búcsú ünnepe");

    await page.goto(`/miserend?datum=${date}`);
    await expect(page.locator('[data-badge="exception"]').first()).toContainText("Elmarad");
    await expect(page.getByText("Búcsú ünnepe").first()).toBeVisible();
  });

  test("a change needs a reason; an extra service can be added", async ({ page }) => {
    const date = nextSunday();
    await openAs(page, "iroda");
    await page.goto("/admin/rend/kivetel");
    await page.getByLabel("Nap", { exact: true }).fill(date);
    await page.getByRole("radio", { name: /Rendkívüli alkalom/ }).check();
    await page.getByRole("textbox", { name: "Időpont" }).fill("19:15");
    await page.getByLabel(/^Ok/).fill("");
    await page.getByTestId("exception-save").click();
    await expect(page.getByText("Adja meg az okot.")).toBeVisible();
    await page.getByLabel(/^Ok/).fill("Hálaadás");
    await expect(page.getByTestId("exception-result")).toContainText("Rendkívüli");
    await page.getByTestId("exception-save").click();
    await expect(page.getByTestId("exception-feedback")).toContainText("mentve");
  });

  test("a holiday template proposes the days and applies them", async ({ page }) => {
    await openAs(page, "iroda");
    await page.goto("/admin/rend/kivetel");
    await page.getByTestId("template-christmas").click();
    await expect(page.getByTestId("template-preview").getByRole("checkbox")).toHaveCount(3);
    await page.getByTestId("template-apply").click();
    await expect(page.getByTestId("template-preview")).toContainText("3 nap rögzítve");
    await expect(page.getByTestId("upcoming-exceptions")).toContainText("Karácsony");
  });

  test("axe: no serious or critical violations", async ({ page }) => {
    await openAs(page, "iroda");
    for (const path of ["/admin/rend", "/admin/rend/kivetel"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
      expect(await axeSeriousOrCritical(page)).toEqual([]);
    }
  });
});

test.describe("terms and presets", () => {
  const TERMS = "/admin/megjelenes/kifejezesek";

  test("a visitor and an editor get no access", async ({ page }) => {
    await page.goto(TERMS);
    await expect(page.getByTestId("area-no-access")).toBeVisible();
    await openAs(page, "szerkeszto");
    await page.goto(TERMS);
    await expect(page.getByTestId("area-no-access")).toBeVisible();
  });

  test("changing a term re-labels the site and the old URL answers 301", async ({ page }) => {
    await openAs(page, "tulajdonos");
    await page.goto(TERMS);
    await page
      .locator('[data-term="serviceSchedule"]')
      .getByRole("button", { name: /Módosítás/ })
      .click();
    const form = page.getByTestId("term-form");
    await form.getByLabel("Megnevezés").fill("Szentmise-rend");
    await expect(page.getByTestId("term-preview").locator('[data-preview="url"]')).toHaveText(
      "/szentmise-rend",
    );
    await expect(page.getByTestId("term-redirect-note")).toContainText("/miserend");
    await page.getByTestId("term-save").dispatchEvent("click");
    await expect(page.getByTestId("terms-feedback")).toContainText("mentve");

    const old = await page.request.get("/miserend", { maxRedirects: 0 });
    expect(old.status()).toBe(301);
    expect(old.headers()["location"]).toContain("/szentmise-rend");

    await page.goto("/miserend");
    await expect(page).toHaveURL(/\/szentmise-rend$/);
    await expect(page.getByRole("heading", { level: 1, name: "Szentmise-rend" })).toBeVisible();

    // Reset brings the preset's wording back.
    await page.goto(TERMS);
    await page
      .locator('[data-term="serviceSchedule"]')
      .getByRole("button", { name: /Módosítás/ })
      .click();
    await page.getByTestId("term-reset").dispatchEvent("click");
    await expect(page.getByTestId("terms-feedback")).toContainText("visszaállt");
    await page.goto("/miserend");
    await expect(page.getByRole("heading", { level: 1, name: "Miserend" })).toBeVisible();
  });

  test("a slug another page uses is refused", async ({ page }) => {
    await openAs(page, "tulajdonos");
    await page.goto(TERMS);
    await page
      .locator('[data-term="serviceSchedule"]')
      .getByRole("button", { name: /Módosítás/ })
      .click();
    await page.getByTestId("term-form").getByLabel("Webcím").fill("hirek");
    await page.getByTestId("term-save").dispatchEvent("click");
    await expect(page.getByText("már egy másik oldal használja").first()).toBeVisible();
  });

  test("switching the denomination shows a diff first, then applies it", async ({ page }) => {
    await openAs(page, "tulajdonos");
    await page.goto(TERMS);
    await expect(page.getByTestId("current-denomination")).toHaveText("Római katolikus");
    await expect(page.getByTestId("denomination-diff")).toHaveCount(0);
    await page.getByTestId("denomination-select").selectOption("ref");
    const diff = page.getByTestId("denomination-diff");
    await expect(diff).toBeVisible();
    await expect(page.getByTestId("diff-terms")).toContainText("Miserend → Istentiszteleti rend");
    await expect(page.getByTestId("diff-redirects")).toContainText("/miserend");
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await page.getByTestId("denomination-apply").click();
    await expect(page.getByTestId("denomination-feedback")).toContainText("átváltva");
    await expect(page.getByTestId("current-denomination")).toHaveText("Református");
    await page.goto("/miserend");
    await expect(page).toHaveURL(/\/istentiszteleti-rend$/);
  });

  test("presets without a pilot reviewer are labelled béta", async ({ page }) => {
    await openAs(page, "tulajdonos");
    await page.goto(TERMS);
    await expect(
      page.getByTestId("denomination-select").locator("option", { hasText: "(béta)" }),
    ).not.toHaveCount(0);
  });

  test("axe: no serious or critical violations", async ({ page }) => {
    await openAs(page, "tulajdonos");
    await page.goto(TERMS);
    await page
      .locator('[data-term="community"]')
      .getByRole("button", { name: /Módosítás/ })
      .click();
    await expect(page.getByTestId("term-form")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });
});
