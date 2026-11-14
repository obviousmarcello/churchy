import { expect, test, type Page } from "@playwright/test";
import {
  BANNER_TEXT,
  CHURCHES,
  PERSONAS,
  axeSeriousOrCritical,
  banner,
  contextSwitcher,
  optionName,
  personaSwitcher,
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
  tulajdonos: {
    visible: ["workspace", "admin", "domain", "users"],
    hidden: ["organization", "songs", "hr"],
  },
  szerkeszto: { visible: ["admin", "news"], hidden: ["appearance", "requests", "domain"] },
  iroda: { visible: ["admin", "announcements", "requests"], hidden: ["news", "appearance"] },
  vezeto: { visible: ["admin", "appearance", "songs"], hidden: ["domain", "hr"] },
  onkentes: { visible: ["workspace", "calendar"], hidden: ["admin", "rooms"] },
  zenei: { visible: ["workspace", "songs"], hidden: ["admin", "hr"] },
  terem: { visible: ["workspace", "rooms"], hidden: ["admin", "songs"] },
  hr: { visible: ["workspace", "hr"], hidden: ["admin", "songs"] },
  bizalmas: { visible: ["workspace", "calendar"], hidden: ["admin", "hr"] },
  egyhazmegyeiHr: {
    visible: ["organization", "orgLinks", "orgTemplates"],
    hidden: ["workspace", "admin"],
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
  await page.goto("/");
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
    await page.goto("/");
    await expect(banner(page)).toContainText(BANNER_TEXT);
    await expect(personaSwitcher(page).locator("summary")).toContainText(PERSONAS.latogato);
    await expect(contextSwitcher(page).locator("summary")).toContainText(CHURCHES.catholic);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("has at least 10 personas", async ({ page }) => {
    await page.goto("/");
    await personaSwitcher(page).locator("summary").click();
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
    await page.goto("/");
    expect(await switchPersona(page, "tulajdonos")).toBeLessThanOrEqual(2);
    expect(await switchContext(page, CHURCHES.reformed)).toBeLessThanOrEqual(2);
    expect(await switchContext(page, CHURCHES.baptist)).toBeLessThanOrEqual(2);
    // The persona's rights move with it: the owner of the Baptist church manages its website.
    await expect(
      (await mainNav(page)).getByRole("link", { name: AREAS.admin.label }),
    ).toBeVisible();
    // Switching to the diocese takes the diocesan persona; back to a church takes the visitor.
    expect(await switchContext(page, CHURCHES.diocese)).toBeLessThanOrEqual(2);
    await expect(personaSwitcher(page).locator("summary")).toContainText(PERSONAS.egyhazmegyeiHr);
    expect(await switchContext(page, CHURCHES.catholic)).toBeLessThanOrEqual(2);
    await expect(personaSwitcher(page).locator("summary")).toContainText(PERSONAS.latogato);
    // Picking the diocesan persona moves to the diocese.
    expect(await switchPersona(page, "egyhazmegyeiHr")).toBeLessThanOrEqual(2);
    await expect(contextSwitcher(page).locator("summary")).toContainText(CHURCHES.diocese);
  });

  test("the selection survives navigation and reloads", async ({ page }) => {
    await page.goto("/");
    await switchPersona(page, "iroda");
    await switchContext(page, CHURCHES.reformed);
    await page.goto("/admin");
    await page.reload();
    await expect(personaSwitcher(page).locator("summary")).toContainText(PERSONAS.iroda);
    await expect(contextSwitcher(page).locator("summary")).toContainText(CHURCHES.reformed);
    await expect(page.locator('[data-section="announcements"]')).toBeVisible();
  });

  for (const [persona, { visible, hidden }] of Object.entries(EXPECTED) as [
    PersonaKey,
    (typeof EXPECTED)[PersonaKey],
  ][]) {
    test(`${PERSONAS[persona]}: menus and routes follow can()`, async ({ page }) => {
      expect(visible.length + hidden.length).toBeGreaterThanOrEqual(2);
      expect(hidden.length).toBeGreaterThanOrEqual(1);
      await page.goto("/");
      await switchPersona(page, persona);
      if (persona === "latogato") {
        // Nothing is granted to an anonymous visitor; the public page is what they see.
        await expect(page.getByRole("heading", { level: 1, name: "Isten hozta!" })).toBeVisible();
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
    await page.goto("/");
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await personaSwitcher(page).locator("summary").click();
    await expect(personaSwitcher(page).getByRole("button").first()).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await personaSwitcher(page).locator("summary").click();

    await contextSwitcher(page).locator("summary").click();
    await expect(contextSwitcher(page).getByRole("button").first()).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await contextSwitcher(page).locator("summary").click();

    await page.getByTestId("demo-reset").click();
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
    await page.goto("/");
    const summary = personaSwitcher(page).locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(personaSwitcher(page)).toHaveAttribute("open", "");
    const current = personaSwitcher(page).locator('[aria-current="true"]');
    await expect(current).toHaveAccessibleName(/Látogató \(jelenlegi\)/);
    await personaSwitcher(page).getByRole("button", { name: PERSONAS.szerkeszto }).focus();
    await page.keyboard.press("Enter");
    await expect(summary).toContainText(PERSONAS.szerkeszto);
  });

  test("the bar does not scroll horizontally at 360 px, closed or open", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);
    await personaSwitcher(page).locator("summary").click();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
