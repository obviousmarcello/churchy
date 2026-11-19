import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

/**
 * D-18 [UI]: admin shell, permission-filtered navigation and dashboard. Every test runs in a fresh
 * browser context, i.e. its own demo session as the visitor in the Catholic parish.
 */

const SECTION_ROUTES = [
  ["news", "/admin/hirek"],
  ["announcements", "/admin/hirdetesek"],
  ["events", "/admin/esemenyek"],
  ["pages", "/admin/oldalak"],
  ["staff", "/admin/munkatarsak"],
  ["locations", "/admin/helyszinek"],
  ["schedule", "/admin/rend"],
  ["requests", "/admin/kerelmek"],
  ["appearance", "/admin/megjelenes"],
  ["users", "/admin/felhasznalok"],
] as const;

/** Sections whose module replaced the placeholder body. */
const BUILT_SECTIONS = new Set([
  "news",
  "requests",
  "announcements",
  "events",
  "pages",
  "staff",
  "locations",
  "appearance",
]);

/** Opens the mobile sidebar when the toggle is shown (below 1024 px). */
async function openSidebar(page: Page) {
  const toggle = page.getByRole("button", { name: "Admin menü megnyitása" });
  if (await toggle.isVisible()) await toggle.click();
  return page.getByRole("navigation", { name: "Admin menü" });
}

async function openAs(page: Page, persona: Parameters<typeof switchPersona>[1], path = "/admin") {
  await page.goto("/");
  await switchPersona(page, persona);
  await page.goto(path);
}

test.describe("admin shell", () => {
  test("the owner sees the whole menu; every section route has a page", async ({ page }) => {
    await openAs(page, "tulajdonos");
    await expect(page.getByRole("heading", { level: 1, name: "Vezérlőpult" })).toBeVisible();
    const nav = await openSidebar(page);
    for (const [id] of SECTION_ROUTES) {
      await expect(nav.locator(`[data-nav-item="${id}"]`)).toHaveCount(1);
    }
    for (const [id, path] of SECTION_ROUTES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // Sections that have been built (content D-21, appearance D-24) replace the placeholder.
      if (!BUILT_SECTIONS.has(id)) {
        await expect(page.getByTestId("admin-placeholder")).toBeVisible();
      }
      const crumbs = page.getByTestId("admin-breadcrumbs");
      await expect(crumbs.getByRole("link", { name: "Vezérlőpult" })).toBeVisible();
    }
  });

  test("the menu follows can(): an editor has no schedule, requests or users", async ({ page }) => {
    await openAs(page, "szerkeszto");
    const nav = await openSidebar(page);
    await expect(nav.locator('[data-nav-item="news"]')).toHaveCount(1);
    await expect(nav.locator('[data-nav-item="schedule"]')).toHaveCount(0);
    await expect(nav.locator('[data-nav-item="requests"]')).toHaveCount(0);
    await expect(nav.locator('[data-nav-item="users"]')).toHaveCount(0);
    // The route itself is gated by the same check.
    await page.goto("/admin/rend");
    await expect(page.getByTestId("area-no-access")).toBeVisible();
    await expect(page.getByTestId("admin-placeholder")).toHaveCount(0);
  });

  test("a visitor gets the no-access notice, not the admin shell", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByTestId("area-no-access")).toBeVisible();
    await expect(page.getByTestId("admin-nav")).toHaveCount(0);
  });

  test("quick actions open their flow in one click", async ({ page }) => {
    await openAs(page, "tulajdonos");
    const quick = page.getByTestId("quick-actions");
    const flows = [
      ["Heti hirdetés", "/admin/hirdetesek/uj"],
      ["Új hír", "/admin/hirek/uj"],
      ["Új esemény", "/admin/esemenyek/uj"],
      ["Miserend módosítása", "/admin/rend/kivetel"],
    ] as const;
    await expect(quick.getByRole("link")).toHaveCount(flows.length);
    for (const [name, path] of flows) {
      await page.goto("/admin");
      await quick.getByRole("link", { name }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("the office sees the request count and only its own quick actions", async ({ page }) => {
    await openAs(page, "iroda");
    await expect(page.getByTestId("dashboard-requests")).toBeVisible();
    await expect(page.getByTestId("dashboard-requests").locator("[data-count]")).toBeVisible();
    const quick = page.getByTestId("quick-actions");
    await expect(quick.getByRole("link", { name: "Heti hirdetés" })).toBeVisible();
    await expect(quick.getByRole("link", { name: "Új hír" })).toHaveCount(0);
  });

  test("the dashboard warns about a missing announcement from Thursday", async ({
    page,
    context,
  }) => {
    await openAs(page, "tulajdonos");
    // A Friday far in the future: the demo data holds no announcement for that week.
    const friday = new Date("2027-06-11T09:00:00+02:00");
    await context.addCookies([
      {
        name: "churchy_demo_now",
        value: friday.toISOString(),
        url: `${new URL(page.url()).origin}/`,
      },
    ]);
    await page.goto("/admin");
    await expect(page.locator('[data-warning="announcement"]')).toBeVisible();
    // The day before (Wednesday) it is not yet due.
    const wednesday = new Date("2027-06-09T09:00:00+02:00");
    await context.addCookies([
      {
        name: "churchy_demo_now",
        value: wednesday.toISOString(),
        url: `${new URL(page.url()).origin}/`,
      },
    ]);
    await page.goto("/admin");
    await expect(page.locator('[data-warning="announcement"]')).toHaveCount(0);
  });

  test("touch targets in the shell are at least 44 px", async ({ page }) => {
    await openAs(page, "tulajdonos");
    const nav = await openSidebar(page);
    const targets = [
      ...(await nav.getByRole("link").all()),
      ...(await page.getByTestId("quick-actions").getByRole("link").all()),
      ...(await page.getByRole("banner").getByRole("link").all()),
    ];
    expect(targets.length).toBeGreaterThan(10);
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box, await target.innerText()).not.toBeNull();
      expect(box!.height, await target.innerText()).toBeGreaterThanOrEqual(43.5);
    }
    const toggle = page.getByRole("button", { name: /Admin menü (megnyitása|bezárása)/ });
    if (await toggle.isVisible()) {
      const box = (await toggle.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      expect(box.width).toBeGreaterThanOrEqual(43.5);
    }
  });

  test("base font size is 17 px", async ({ page }) => {
    await openAs(page, "tulajdonos");
    const size = await page
      .getByTestId("admin-dashboard")
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(size).toBe("17px");
  });

  test("mobile menu: the toggle shows the menu, Escape closes it", async ({ page }) => {
    await openAs(page, "tulajdonos");
    const toggle = page.getByRole("button", { name: "Admin menü megnyitása" });
    test.skip(!(await toggle.isVisible()), "desktop layout shows the sidebar permanently");
    await toggle.click();
    await expect(page.getByTestId("admin-nav")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("admin-nav")).toBeHidden();
    await expect(page.getByRole("button", { name: "Admin menü megnyitása" })).toBeFocused();
  });

  test("axe: no serious or critical violations on the dashboard and a section", async ({
    page,
  }) => {
    await openAs(page, "tulajdonos");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.goto("/admin/rend");
    await expect(page.getByTestId("admin-placeholder")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });
});
