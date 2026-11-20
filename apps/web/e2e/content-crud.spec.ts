import { expect, test, type Page } from "@playwright/test";
import {
  CHURCHES,
  axeSeriousOrCritical,
  switchContext,
  switchPersona,
  type PersonaKey,
} from "./demo-helpers";

/**
 * D-20 / D-21 [UI]: content CRUD and the publishing workflow of news, announcements, events,
 * pages, staff and locations in the admin. Every test runs in a fresh browser context, i.e. its
 * own demo session, so created content never leaks between tests.
 */

async function openAs(page: Page, persona: PersonaKey, path = "/admin") {
  await page.goto("/");
  await switchPersona(page, persona);
  await page.goto(path);
}

/** Moves the demo clock of the visitor's own session (the `churchy_demo_now` cookie, D-13). */
async function setDemoNow(page: Page, iso: string) {
  await page.context().addCookies([
    {
      name: "churchy_demo_now",
      value: new Date(iso).toISOString(),
      url: `${new URL(page.url()).origin}/`,
    },
  ]);
}

/** A field of the content form by its label (optional ones carry a "(nem kötelező)" suffix). */
const field = (page: Page, label: string) =>
  page.locator("main form").getByLabel(new RegExp(`^${label}\\s*(\\(nem kötelező\\))?$`));
const state = (page: Page) => page.getByTestId("publish-state");
const submit = (page: Page) => page.getByTestId("form-submit");

async function publicStatus(page: Page, path: string): Promise<number> {
  return (await page.request.get(path)).status();
}

async function confirmDelete(page: Page) {
  await page.getByTestId("delete-open").click();
  await page.getByTestId("delete-confirm").click();
}

test.describe("news", () => {
  test("create → preview → publish → visible on the site → edit → delete", async ({ page }) => {
    await openAs(page, "tulajdonos", "/admin/hirek/uj");
    await field(page, "Cím").fill("Őszi adománygyűjtés");
    await field(page, "Szöveg").fill("Első bekezdés.\n\nMásodik bekezdés.");
    await field(page, "Kategóriák").fill("Közösség, Segítség");
    await submit(page).click();

    // Saved as a draft, with an automatic Webcím.
    await expect(page).toHaveURL(/\/admin\/hirek\/[^/?]+\?mentve=1$/);
    await expect(page.getByTestId("saved-notice")).toBeVisible();
    await expect(state(page)).toHaveText("Piszkozat");
    await expect(field(page, "Webcím")).toHaveValue("oszi-adomanygyujtes");
    expect(await publicStatus(page, "/hirek/oszi-adomanygyujtes")).toBe(404);

    // The preview renders the public template.
    await page.getByTestId("preview-link").click();
    await expect(page).toHaveURL(/\/elonezet$/);
    const preview = page.getByTestId("preview-content");
    await expect(preview.getByRole("heading", { name: "Őszi adománygyűjtés" })).toBeVisible();
    await expect(preview.getByText("Második bekezdés.")).toBeVisible();
    await page.getByRole("link", { name: "Vissza a szerkesztéshez" }).click();

    // Publish: visible on the public site.
    await page.getByTestId("publish-now").click();
    await expect(state(page)).toHaveText("Közzétéve");
    await page.goto("/hirek/oszi-adomanygyujtes");
    await expect(
      page.getByRole("heading", { level: 1, name: "Őszi adománygyűjtés" }),
    ).toBeVisible();

    // Edit: the change shows on the site, the Webcím stays.
    await page.goBack();
    await field(page, "Cím").fill("Őszi adománygyűjtés – eredmény");
    await submit(page).click();
    await expect(page.getByTestId("saved-notice")).toBeVisible();
    await page.goto("/hirek/oszi-adomanygyujtes");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Őszi adománygyűjtés – eredmény",
    );

    // Back to draft hides it; delete (with confirmation) removes it.
    await page.goBack();
    await page.getByTestId("publish-undo").click();
    await expect(state(page)).toHaveText("Piszkozat");
    expect(await publicStatus(page, "/hirek/oszi-adomanygyujtes")).toBe(404);
    await page.getByTestId("delete-open").click();
    await page.getByRole("button", { name: "Mégse" }).click();
    await expect(page).toHaveURL(/\/admin\/hirek\/[^/?]+/);
    await confirmDelete(page);
    await expect(page).toHaveURL(/\/admin\/hirek$/);
    await expect(page.getByTestId("news-table")).not.toContainText("Őszi adománygyűjtés");
  });

  test("scheduling: not visible before the date, visible after it", async ({ page }) => {
    await openAs(page, "tulajdonos", "/admin/hirek/uj");
    await field(page, "Cím").fill("Jövőbeli hír");
    await field(page, "Szöveg").fill("Később jelenik meg.");
    await submit(page).click();
    await expect(state(page)).toHaveText("Piszkozat");

    await page.getByTestId("schedule-at").fill("2027-05-14T09:30");
    await page.getByTestId("schedule-submit").click();
    await expect(state(page)).toHaveText("Időzítve");
    await expect(page.getByTestId("publish-panel")).toContainText("2027. május 14.");
    expect(await publicStatus(page, "/hirek/jovobeli-hir")).toBe(404);

    // The demo clock passes the date: the post is public, the admin shows it as published.
    await setDemoNow(page, "2027-05-15T12:00:00+02:00");
    expect(await publicStatus(page, "/hirek/jovobeli-hir")).toBe(200);
    await page.reload();
    await expect(state(page)).toHaveText("Közzétéve");
  });

  test("list: search and state filter; list stays in step with changes", async ({ page }) => {
    await openAs(page, "tulajdonos", "/admin/hirek");
    const table = page.getByTestId("news-table");
    await expect(table.getByRole("row")).not.toHaveCount(1); // demo posts exist

    await page.getByLabel("Keresés a névben vagy címben").fill("zzzz-nincs-ilyen");
    await page.getByRole("button", { name: "Szűrés" }).click();
    await expect(page.getByTestId("news-table")).toContainText("A keresésnek nincs találata.");
    await page.getByRole("link", { name: "Szűrés törlése" }).click();

    await page.getByLabel("Állapot").selectOption("draft");
    await page.getByRole("button", { name: "Szűrés" }).click();
    await expect(page).toHaveURL(/allapot=draft/);
    for (const badge of await table.getByTestId("state-badge").all()) {
      await expect(badge).toHaveAttribute("data-state", "draft");
    }
  });

  test("validation messages are Hungarian; the Webcím is made unique", async ({ page }) => {
    await openAs(page, "tulajdonos", "/admin/hirek/uj");
    await submit(page).click();
    await expect(page.getByTestId("form-errors")).toBeVisible();
    await expect(page.getByText("Ez a mező kötelező.").first()).toBeVisible();

    for (const slug of ["", ""]) {
      await page.goto("/admin/hirek/uj");
      await field(page, "Cím").fill("Ugyanaz a cím");
      await field(page, "Szöveg").fill("Szöveg.");
      if (slug) await field(page, "Webcím").fill(slug);
      await submit(page).click();
      await expect(page.getByTestId("saved-notice")).toBeVisible();
    }
    // The second post got `-2`.
    await expect(field(page, "Webcím")).toHaveValue("ugyanaz-a-cim-2");

    // A typed Webcím that is taken is refused, with the form kept.
    await page.goto("/admin/hirek/uj");
    await field(page, "Cím").fill("Harmadik");
    await field(page, "Szöveg").fill("Szöveg.");
    await field(page, "Webcím").fill("ugyanaz-a-cim");
    await submit(page).click();
    await expect(
      page.getByText("Ez a webcím már foglalt. Kérjük, válasszon másikat."),
    ).toBeVisible();
    await expect(field(page, "Cím")).toHaveValue("Harmadik");
  });
});

test.describe("weekly announcements", () => {
  test("three steps: the coming Sunday is preselected, type, publish", async ({ page }) => {
    await openAs(page, "iroda", "/admin");
    // A Friday far ahead: no demo announcement exists for that week.
    await setDemoNow(page, "2027-06-11T09:00:00+02:00");
    await page.goto("/admin");
    await page.getByTestId("quick-actions").getByRole("link", { name: "Heti hirdetés" }).click(); // 1
    await expect(field(page, "Vasárnap")).toHaveValue("2027-06-13");
    await field(page, "Szöveg").fill("Vasárnap 10 órakor szentmise.\n\nCsütörtökön hittan."); // 2
    await page.getByTestId("form-intent").click(); // 3

    await expect(page).toHaveURL(/\/admin\/hirdetesek\/[^/?]+\?mentve=1$/);
    await expect(state(page)).toHaveText("Közzétéve");
    await page.goto("/hirdetesek?het=2027-06-13");
    await expect(page.getByTestId("announcement-body")).toContainText("Csütörtökön hittan.");
  });

  test("only Sundays; one announcement per week; draft stays hidden", async ({ page }) => {
    await openAs(page, "tulajdonos", "/admin/hirdetesek/uj");
    await setDemoNow(page, "2027-06-11T09:00:00+02:00");
    await page.goto("/admin/hirdetesek/uj");
    await field(page, "Vasárnap").fill("2027-06-14");
    await field(page, "Szöveg").fill("Hétfői hirdetés.");
    await submit(page).click();
    await expect(page.getByText("A hirdetés vasárnaphoz tartozik.")).toBeVisible();

    await field(page, "Vasárnap").fill("2027-06-20");
    await submit(page).click(); // saved as a draft
    await expect(state(page)).toHaveText("Piszkozat");
    await page.goto("/hirdetesek?het=2027-06-20");
    await expect(page.getByTestId("announcement-body")).toHaveCount(0);

    // The week is taken now: the flow offers the next free Sunday.
    await page.goto("/admin/hirdetesek/uj");
    await expect(field(page, "Vasárnap")).toHaveValue("2027-06-13");
    await field(page, "Vasárnap").fill("2027-06-20");
    await field(page, "Szöveg").fill("Még egy.");
    await submit(page).click();
    await expect(page.getByText("Erre a hétre már készült hirdetés.")).toBeVisible();
  });
});

test.describe("events", () => {
  test("create → publish → visible on the site → cancel → delete", async ({ page }) => {
    await openAs(page, "tulajdonos", "/admin/esemenyek/uj");
    await field(page, "Cím").fill("Jótékonysági est");
    await field(page, "Kezdés").fill("2030-03-20T18:00");
    await field(page, "Leírás").fill("Közös vacsora a plébánia kertjében.");
    await submit(page).click();
    await expect(page).toHaveURL(/\/admin\/esemenyek\/[^/?]+\?mentve=1$/);
    await expect(state(page)).toHaveText("Piszkozat");
    expect(await publicStatus(page, "/esemenyek/jotekonysagi-est")).toBe(404);

    await page.getByTestId("preview-link").click();
    await expect(page.getByTestId("preview-content")).toContainText("Jótékonysági est");
    await page.getByRole("link", { name: "Vissza a szerkesztéshez" }).click();

    await page.getByTestId("publish-now").click();
    await expect(state(page)).toHaveText("Közzétéve");
    await page.goto("/esemenyek/jotekonysagi-est");
    await expect(page.getByRole("heading", { level: 1, name: "Jótékonysági est" })).toBeVisible();

    await page.goBack();
    await page.getByTestId("publish-cancel").click();
    await expect(state(page)).toHaveText("Lemondva");
    expect(await publicStatus(page, "/esemenyek/jotekonysagi-est")).toBe(404);

    await confirmDelete(page);
    await expect(page).toHaveURL(/\/admin\/esemenyek$/);
    await expect(page.getByTestId("events-table")).not.toContainText("Jótékonysági est");
  });

  test("the end may not be before the start", async ({ page }) => {
    await openAs(page, "tulajdonos", "/admin/esemenyek/uj");
    await field(page, "Cím").fill("Fordított idő");
    await field(page, "Kezdés").fill("2030-03-20T18:00");
    await field(page, "Befejezés").fill("2030-03-20T17:00");
    await submit(page).click();
    await expect(page.getByText("A befejezés nem lehet korábbi a kezdésnél.")).toBeVisible();
  });
});

test.describe("pages", () => {
  test("create → publish → visible at its Webcím → delete", async ({ page }) => {
    await openAs(page, "szerkeszto", "/admin/oldalak/uj");
    await field(page, "Cím").fill("Plébániai séta");
    await field(page, "Tartalom").fill("## Bevezető\n\nIndulás a templomtól.");
    await submit(page).click();
    await expect(page).toHaveURL(/\/admin\/oldalak\/[^/?]+\?mentve=1$/);
    expect(await publicStatus(page, "/plebaniai-seta")).toBe(404);

    await page.getByTestId("preview-link").click();
    await expect(page.getByTestId("preview-content")).toContainText("Indulás a templomtól.");
    await page.getByRole("link", { name: "Vissza a szerkesztéshez" }).click();

    await page.getByTestId("publish-now").click();
    await expect(state(page)).toHaveText("Közzétéve");
    await page.goto("/plebaniai-seta");
    await expect(page.getByTestId("static-page")).toContainText("Indulás a templomtól.");

    await page.goBack();
    await confirmDelete(page);
    await expect(page).toHaveURL(/\/admin\/oldalak$/);
    expect(await publicStatus(page, "/plebaniai-seta")).toBe(404);
  });
});

test.describe("staff", () => {
  test("create, reorder with the buttons, delete", async ({ page }) => {
    await openAs(page, "tulajdonos", "/admin/munkatarsak/uj");
    await field(page, "Családnév").fill("Mintapélda");
    await field(page, "Utónév").fill("Elek");
    await field(page, "Beosztás").fill("Sekrestyés");
    await submit(page).click();
    await expect(page).toHaveURL(/\/admin\/munkatarsak\/[^/?]+\?mentve=1$/);

    await page.goto("/admin/munkatarsak");
    const items = page.getByTestId("reorder-item");
    const ids = () => items.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset["id"]));
    const before = await ids();
    const row = items.filter({ hasText: "Mintapélda Elek" });
    const id = await row.getAttribute("data-id");
    expect(id).toBeTruthy();
    expect(before.at(-1)).toBe(id);

    await row.getByTestId("move-up").click();
    await expect(page.getByText("A sorrend mentve.")).toBeVisible();
    await page.reload();
    const after = await ids();
    expect(after.indexOf(id)).toBe(before.length - 2);

    await row.getByTestId("delete-open").click();
    await page.getByTestId("delete-confirm").click();
    await expect(items.filter({ hasText: "Mintapélda Elek" })).toHaveCount(0);
  });

  test("ordering is off while searching", async ({ page }) => {
    await openAs(page, "tulajdonos", "/admin/munkatarsak?q=a");
    await expect(page.getByText("Szűrés közben a sorrend nem módosítható.")).toBeVisible();
    await expect(page.getByTestId("move-up")).toHaveCount(0);
  });
});

test.describe("locations", () => {
  test("create, reorder by drag and drop, delete", async ({ page, isMobile }) => {
    await openAs(page, "tulajdonos", "/admin/helyszinek/uj");
    await field(page, "Név").fill("Mintakápolna");
    await field(page, "Típus").selectOption("kapolna");
    await field(page, "Irányítószám").fill("1011");
    await field(page, "Település").fill("Budapest");
    await field(page, "Utca, házszám").fill("Fő utca 1.");
    await page.getByLabel("Parkoló").check();
    await submit(page).click();
    await expect(page).toHaveURL(/\/admin\/helyszinek\/[^/?]+\?mentve=1$/);

    await page.goto("/admin/helyszinek");
    const items = page.getByTestId("reorder-item");
    const ids = () => items.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset["id"]));
    const row = items.filter({ hasText: "Mintakápolna" });
    const id = await row.getAttribute("data-id");
    await expect(row).toContainText("1011 Budapest, Fő utca 1.");

    if (isMobile) {
      // Touch screens use the buttons.
      await row.getByTestId("move-up").click();
    } else {
      await row.dragTo(items.first(), { sourcePosition: { x: 12, y: 12 } });
    }
    await expect(page.getByText("A sorrend mentve.")).toBeVisible();
    await page.reload();
    const after = await ids();
    expect(after.indexOf(id)).toBeLessThan((await ids()).length - 1);
    if (!isMobile) expect(after[0]).toBe(id);

    await row.getByTestId("delete-open").click();
    await page.getByTestId("delete-confirm").click();
    await expect(items.filter({ hasText: "Mintakápolna" })).toHaveCount(0);
  });
});

test.describe("permissions", () => {
  test("visitors get no content screens, drafts or previews", async ({ page }) => {
    for (const path of [
      "/admin/hirek",
      "/admin/hirek/uj",
      "/admin/hirek/valami/elonezet",
      "/admin/esemenyek/valami/elonezet",
      "/admin/oldalak/valami/elonezet",
      "/admin/hirdetesek/valami/elonezet",
      "/admin/munkatarsak/uj",
      "/admin/helyszinek",
    ]) {
      await page.goto(path);
      await expect(page.getByTestId("area-no-access")).toBeVisible();
    }
  });

  test("what an editor and the office may do follows can()", async ({ page }) => {
    // Editors write news and pages but do not manage locations.
    await openAs(page, "szerkeszto", "/admin/helyszinek");
    await expect(page.getByTestId("area-no-access")).toBeVisible();
    await page.goto("/admin/hirek/uj");
    await expect(page.getByTestId("news-form")).toBeVisible();

    // The office writes announcements and manages locations but not news.
    await openAs(page, "iroda", "/admin/hirek");
    await expect(page.getByTestId("area-no-access")).toBeVisible();
    await page.goto("/admin/hirdetesek/uj");
    await expect(page.getByTestId("announcement-form")).toBeVisible();
    await page.goto("/admin/helyszinek");
    await expect(page.getByTestId("admin-locations")).toBeVisible();
  });
});

test.describe("the three demo churches", () => {
  for (const [key, church] of Object.entries({
    catholic: CHURCHES.catholic,
    reformed: CHURCHES.reformed,
    baptist: CHURCHES.baptist,
  })) {
    test(`news and pages work in ${key}`, async ({ page }) => {
      await page.goto("/");
      await switchContext(page, church);
      await switchPersona(page, "tulajdonos");

      await page.goto("/admin/hirek/uj");
      await field(page, "Cím").fill(`Próba hír ${key}`);
      await field(page, "Szöveg").fill("Bemutató tartalom.");
      await submit(page).click();
      await page.getByTestId("publish-now").click();
      await expect(state(page)).toHaveText("Közzétéve");
      await page.goto(`/hirek/proba-hir-${key}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Próba hír ${key}`);

      await page.goto("/admin/oldalak");
      await expect(page.getByTestId("pages-table")).toBeVisible();
      await page.goto("/admin/munkatarsak");
      await expect(page.getByTestId("staff-list")).toBeVisible();
      await page.goto("/admin/helyszinek");
      await expect(page.getByTestId("locations-list")).toBeVisible();
    });
  }
});

test.describe("accessibility", () => {
  test("content screens have no serious or critical axe violations", async ({ page }) => {
    await openAs(page, "tulajdonos", "/admin/hirek");
    const paths = [
      "/admin/hirek",
      "/admin/hirek/uj",
      "/admin/hirdetesek",
      "/admin/hirdetesek/uj",
      "/admin/esemenyek",
      "/admin/esemenyek/uj",
      "/admin/oldalak",
      "/admin/oldalak/uj",
      "/admin/munkatarsak",
      "/admin/munkatarsak/uj",
      "/admin/helyszinek",
      "/admin/helyszinek/uj",
    ];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await axeSeriousOrCritical(page), path).toEqual([]);
    }
    // An edit screen with the publishing panel, its preview and the delete dialog.
    await page.goto("/admin/hirek");
    await page.getByTestId("news-table").getByRole("link").first().click();
    await expect(page.getByTestId("publish-panel")).toBeVisible();
    expect(await axeSeriousOrCritical(page), "news edit").toEqual([]);
    await page.getByTestId("delete-open").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await axeSeriousOrCritical(page), "delete dialog").toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByTestId("preview-link").click();
    await expect(page.getByTestId("preview-content")).toBeVisible();
    expect(await axeSeriousOrCritical(page), "news preview").toEqual([]);
  });
});
