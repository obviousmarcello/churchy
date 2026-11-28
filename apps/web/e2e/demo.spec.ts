import { gotoHome } from "./site-helpers";
import { expect, test, type Page } from "@playwright/test";
import {
  BANNER_TEXT,
  CHURCHES,
  PERSONAS,
  axeSeriousOrCritical,
  banner,
  contextSwitcher,
  currentContext,
  currentPersona,
  demoMenu,
  openDemoMenu,
  optionName,
  personaSwitcher,
  resetDemoData,
  switchContext,
  switchPersona,
  type PersonaKey,
} from "./demo-helpers";

/**
 * D-92 role switcher: every persona's menus and routes are decided by the real `can()` with the
 * actor built from the persona's demo membership. Each test runs in a fresh browser context, so it
 * has its own demo session (cookies) and starts as the visitor (*Látogató*) in the Catholic parish.
 */

const AREAS = {
  workspace: { path: "/munkater", label: "Munkatér" },
  admin: { path: "/admin", label: "Weboldal kezelése" },
  organization: { path: "/egyhazmegye", label: "Egyházmegyei portál" },
} as const;
type Area = keyof typeof AREAS;

/** Section ids per area (data-section on the landing pages). */
const SECTION_AREA: Record<string, Area> = {
  directory: "workspace",
  calendar: "workspace",
  rooms: "workspace",
  songs: "workspace",
  absences: "workspace",
  hr: "workspace",
  news: "admin",
  announcements: "admin",
  schedule: "admin",
  requests: "admin",
  appearance: "admin",
  users: "admin",
  domain: "admin",
  orgOverview: "organization",
  orgRequests: "organization",
  orgAbsences: "organization",
  orgReports: "organization",
  orgLink: "admin",
  orgLinks: "organization",
  orgTemplates: "organization",
  orgMembers: "organization",
};

/**
 * What each persona sees (≥ 1 visible and ≥ 1 hidden item): areas in the header and sections on
 * the area landing pages. Mirrors the unit test `server/demo-personas.test.ts`.
 */
const EXPECTED: Record<PersonaKey, { visible: string[]; hidden: string[] }> = {
  // can() denies every action to an anonymous visitor: only the public page is visible.
  latogato: { visible: [], hidden: ["workspace", "admin", "organization"] },
  uzemelteto: { visible: [], hidden: ["workspace", "admin", "organization"] },
  tulajdonos: {
    visible: ["workspace", "admin", "domain", "users"],
    hidden: ["organization"],
  },
  szerkeszto: { visible: ["admin", "news"], hidden: ["appearance", "requests", "domain"] },
  iroda: { visible: ["admin", "announcements", "requests"], hidden: ["news", "appearance"] },
  vezeto: { visible: ["admin", "appearance", "songs", "hr"], hidden: ["domain"] },
  onkentes: { visible: ["workspace", "calendar"], hidden: ["admin", "rooms"] },
  csoportvezeto: { visible: ["workspace", "calendar", "hr"], hidden: ["admin"] },
  zenei: { visible: ["workspace", "songs", "hr"], hidden: ["admin"] },
  // Every workspace role reads the songs (music module, owner decision 2026-11-24).
  terem: { visible: ["workspace", "rooms", "songs"], hidden: ["admin"] },
  hr: { visible: ["workspace", "hr", "songs"], hidden: ["admin"] },
  bizalmas: { visible: ["workspace", "calendar", "hr"], hidden: ["admin"] },
  egyhazmegyeiHr: {
    visible: ["organization", "orgLinks", "orgTemplates"],
    hidden: ["workspace", "admin"],
  },
  egyhazmegyeiUgyintezo: {
    visible: ["organization", "orgOverview", "orgRequests"],
    hidden: ["workspace", "admin", "orgLinks", "orgTemplates"],
  },
};

/** The header's main navigation; opens the mobile disclosure menu first when needed. */
async function mainNav(page: Page) {
  const nav = page.getByRole("navigation", { name: "Főmenü" });
  const toggle = page.getByRole("button", { name: "Menü megnyitása" });
  if (await toggle.isVisible()) await toggle.click();
  return nav;
}

async function expectArea(page: Page, area: Area, visible: boolean) {
  const { path, label } = AREAS[area];
  // Any page with the app header: it lists the areas the persona may open.
  await page.goto("/munkater");
  const header = page.locator("header").filter({ has: page.getByRole("navigation") });
  if (visible) {
    await expect((await mainNav(page)).getByRole("link", { name: label })).toBeVisible();
  } else if ((await header.count()) > 0) {
    await expect((await mainNav(page)).getByRole("link", { name: label })).toHaveCount(0);
  }
  // The route itself is decided by the same can(): the landing page or a no-access notice.
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if (visible) await expect(page.getByTestId("area-sections")).toBeVisible();
  else await expect(page.getByTestId("area-no-access")).toBeVisible();
}

async function expectSection(page: Page, section: string, visible: boolean) {
  const area = SECTION_AREA[section]!;
  await page.goto(AREAS[area].path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(`[data-section="${section}"]`)).toHaveCount(visible ? 1 : 0);
}

async function expectItem(page: Page, id: string, visible: boolean) {
  if (id in AREAS) await expectArea(page, id as Area, visible);
  else await expectSection(page, id, visible);
}

test.describe("demo role switcher", () => {
  test("the banner, the persona and the church are shown on the first visit", async ({ page }) => {
    await gotoHome(page);
    await expect(banner(page)).toContainText(BANNER_TEXT);
    await expect(currentPersona(page)).toHaveText(PERSONAS.latogato);
    await expect(currentContext(page)).toHaveText(CHURCHES.catholic);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("has at least 10 personas", async ({ page }) => {
    await gotoHome(page);
    await openDemoMenu(page);
    const buttons = personaSwitcher(page).getByRole("button");
    await expect(buttons).toHaveCount(Object.keys(PERSONAS).length);
    expect(await buttons.count()).toBeGreaterThanOrEqual(10);
    for (const label of Object.values(PERSONAS)) {
      await expect(
        personaSwitcher(page).getByRole("button", { name: optionName(label) }),
      ).toBeVisible();
    }
  });

  test("switching persona or church takes ≤ 2 clicks", async ({ page }) => {
    await gotoHome(page);
    expect(await switchPersona(page, "tulajdonos")).toBeLessThanOrEqual(2);
    expect(await switchContext(page, CHURCHES.reformed)).toBeLessThanOrEqual(2);
    expect(await switchContext(page, CHURCHES.baptist)).toBeLessThanOrEqual(2);
    // The persona's rights move with it: the owner of the Baptist church manages its website.
    await expect(
      (await mainNav(page)).getByRole("link", { name: AREAS.admin.label }),
    ).toBeVisible();
    // Switching to the diocese takes the diocesan persona; back to a church takes the visitor.
    expect(await switchContext(page, CHURCHES.diocese)).toBeLessThanOrEqual(2);
    await expect(currentPersona(page)).toHaveText(PERSONAS.egyhazmegyeiHr);
    expect(await switchContext(page, CHURCHES.catholic)).toBeLessThanOrEqual(2);
    await expect(currentPersona(page)).toHaveText(PERSONAS.latogato);
    // Picking the diocesan persona moves to the diocese.
    expect(await switchPersona(page, "egyhazmegyeiHr")).toBeLessThanOrEqual(2);
    await expect(currentContext(page)).toHaveText(CHURCHES.diocese);
  });

  test("the selection survives navigation and reloads", async ({ page }) => {
    await gotoHome(page);
    await switchPersona(page, "iroda");
    await switchContext(page, CHURCHES.reformed);
    await page.goto("/admin");
    await page.reload();
    await expect(currentPersona(page)).toHaveText(PERSONAS.iroda);
    await expect(currentContext(page)).toHaveText(CHURCHES.reformed);
    await expect(page.locator('[data-section="announcements"]')).toBeVisible();
  });

  for (const [persona, { visible, hidden }] of Object.entries(EXPECTED) as [
    PersonaKey,
    (typeof EXPECTED)[PersonaKey],
  ][]) {
    test(`${PERSONAS[persona]}: menus and routes follow can()`, async ({ page }) => {
      expect(visible.length + hidden.length).toBeGreaterThanOrEqual(2);
      expect(hidden.length).toBeGreaterThanOrEqual(1);
      await gotoHome(page);
      await switchPersona(page, persona);
      if (persona === "latogato") {
        // Nothing is granted to an anonymous visitor; the public page is what they see.
        await expect(
          page.getByRole("heading", { level: 1, name: CHURCHES.catholic }),
        ).toBeVisible();
      }
      for (const id of visible) await expectItem(page, id, true);
      for (const id of hidden) await expectItem(page, id, false);
    });
  }
});

test.describe("demo bar accessibility", () => {
  test("axe: 0 serious/critical on the banner, both switchers and after a reset", async ({
    page,
  }) => {
    await gotoHome(page);
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // The open menu shows both switchers and the reset button at once.
    await openDemoMenu(page);
    await expect(personaSwitcher(page).getByRole("button").first()).toBeVisible();
    await expect(contextSwitcher(page).getByRole("button").first()).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await resetDemoData(page);
    await expect(page.getByTestId("demo-reset-status")).toContainText("visszaálltak");
    // The refresh after a reset briefly drops <title>; wait for it before running axe.
    await expect(page).toHaveTitle(/.+/);
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await switchPersona(page, "tulajdonos");
    await page.goto("/admin");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("the switchers work with the keyboard and the current option is announced", async ({
    page,
  }) => {
    await gotoHome(page);
    const summary = demoMenu(page).locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(demoMenu(page)).toHaveAttribute("open", "");
    const current = personaSwitcher(page).locator('[aria-current="true"]');
    await expect(current).toHaveAccessibleName(/Látogató \(jelenlegi\)/);
    // Escape closes the menu and returns focus to its button.
    await page.keyboard.press("Escape");
    await expect(demoMenu(page)).not.toHaveAttribute("open");
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    await personaSwitcher(page).getByRole("button", { name: PERSONAS.szerkeszto }).focus();
    await page.keyboard.press("Enter");
    await expect(currentPersona(page)).toHaveText(PERSONAS.szerkeszto);
    await expect(summary).toBeFocused();
  });

  test("the bar does not scroll horizontally at 360 px, closed or open", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await gotoHome(page);
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);
    await openDemoMenu(page);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });

  test("the chip is small, discreet, bottom-left and a 44 px target; the notice is in its menu", async ({
    page,
  }) => {
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await gotoHome(page);
      const summary = banner(page).locator("summary");
      const box = await summary.boundingBox();
      expect(box!.height, `${width}px`).toBeGreaterThanOrEqual(43.5);
      expect(box!.height, `${width}px`).toBeLessThanOrEqual(56);
      expect(box!.width, `${width}px`).toBeLessThanOrEqual(140);
      expect(box!.x, `${width}px`).toBeLessThanOrEqual(24);
      await expect(summary).toHaveAttribute("title", BANNER_TEXT);
      await expect(banner(page)).toContainText(BANNER_TEXT);
      await openDemoMenu(page);
      await expect(banner(page).getByText(BANNER_TEXT, { exact: true })).toBeVisible();
    }
  });
});
