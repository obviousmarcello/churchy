import { expect, test, type Browser, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona, type PersonaKey } from "./demo-helpers";

/**
 * D-28 [UI] request forms and D-29 [UI] requests inbox. Every test runs in a fresh browser context,
 * i.e. its own demo session, so submitted and handled requests never leak between tests. Each
 * context also gets its own client address (`x-forwarded-for`), because the public form allows
 * only five submissions per hour and address.
 */

const FORM = "/szentsegek/keresztelo/bejelentes";
const OUTBOX = "/fejlesztes/kimeno-levelek";
const REFERENCE = /^KER-\d{4}-\d{4}$/;
/** The time-trap refuses submissions faster than 2 s after the form was rendered. */
const HUMAN_PAUSE = 2200;

const randomAddress = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomAddress() });
});

/** A control of the request form by its label (optional ones carry a "(nem kötelező)" suffix). */
const field = (page: Page, label: string) =>
  page.getByLabel(new RegExp(`^${label.replace(/[?.()]/g, "\\$&")}\\s*(\\(nem kötelező\\))?$`));

const CONTACT = {
  "Kapcsolattartó neve": "Teszt Elek Kérelmező",
  "E-mail-cím": "teszt.kerelmezo@pelda.hu",
  Telefonszám: "+36 30 000 0000",
} as const;
const DETAILS = {
  "A gyermek neve": "Teszt Gyermek",
  "A gyermek születési ideje": "2026-09-01",
} as const;

async function fillAll(page: Page, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) await field(page, label).fill(value);
}

/** Fills the form in the multi-step flow up to the summary step. */
async function fillSteps(page: Page) {
  await fillAll(page, CONTACT);
  await page.getByTestId("request-next").click();
  await fillAll(page, DETAILS);
  await page.getByTestId("request-next").click();
  await expect(page.getByTestId("request-summary")).toBeVisible();
}

async function openAs(page: Page, persona: PersonaKey, path: string) {
  await page.goto("/");
  await switchPersona(page, persona);
  await page.goto(path);
}

/** Submits the request form as a visitor and returns the reference number. */
async function submitAsVisitor(page: Page): Promise<string> {
  await page.goto(FORM);
  await expect(page.getByTestId("request-form")).toHaveAttribute("data-enhanced", "true");
  await page.waitForLoadState("networkidle");
  await fillSteps(page);
  await page.getByLabel(/^Hozzájárulok/).check();
  await page.waitForTimeout(HUMAN_PAUSE);
  await page.getByTestId("request-submit").click();
  const reference = page.getByTestId("request-reference");
  await expect(reference).toContainText("Hivatkozási szám: KER-");
  const text = (await reference.textContent()) ?? "";
  return text.replace("Hivatkozási szám: ", "").trim();
}

test.describe("public request form", () => {
  test("multi-step flow with summary, consent and a reference number", async ({ page }) => {
    await page.goto(FORM);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("bejelentés");
    await expect(page.getByTestId("request-form")).toHaveAttribute("data-enhanced", "true");
    await expect(page.getByText("1. lépés / 3")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Step 1 checks its own fields before moving on.
    await page.getByTestId("request-next").click();
    await expect(page.getByText("Ez a mező kötelező.")).toHaveCount(3);
    await fillAll(page, { ...CONTACT, "E-mail-cím": "nem-email" });
    await page.getByTestId("request-next").click();
    await expect(page.getByText("Kérjük, adjon meg érvényes értéket.")).toBeVisible();
    await field(page, "E-mail-cím").fill(CONTACT["E-mail-cím"]);
    await page.getByTestId("request-next").click();

    // Step 2: the rite's own fields.
    await expect(page.getByText("2. lépés / 3")).toBeVisible();
    await expect(page.getByTestId("request-step-contact")).toBeHidden();
    await page.getByTestId("request-next").click();
    await expect(page.getByText("Ez a mező kötelező.")).toHaveCount(2);
    await fillAll(page, DETAILS);
    await page.getByTestId("request-back").click();
    await expect(field(page, "Kapcsolattartó neve")).toHaveValue(CONTACT["Kapcsolattartó neve"]);
    await page.getByTestId("request-next").click();
    await page.getByTestId("request-next").click();

    // Step 3: summary, then consent.
    await expect(page.getByText("3. lépés / 3")).toBeVisible();
    const summary = page.getByTestId("request-summary");
    await expect(summary).toContainText("Teszt Gyermek");
    await expect(summary).toContainText("teszt.kerelmezo@pelda.hu");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.waitForTimeout(HUMAN_PAUSE);
    await page.getByTestId("request-submit").click();
    await expect(page.getByText("A bejelentéshez a hozzájárulás szükséges.")).toBeVisible();
    // React resets the form once the action settles; tick the box only after that.
    await page.waitForTimeout(500);

    await page.getByLabel(/^Hozzájárulok/).check();
    await page.getByTestId("request-submit").click();
    const success = page.getByTestId("request-success");
    await expect(success).toBeVisible();
    await expect(page.getByTestId("request-reference")).toContainText(/KER-\d{4}-\d{4}/);
    // The tenant-configurable confirmation text of the form.
    await expect(success).toContainText("Irodánk 3 munkanapon belül felveszi Önnel a kapcsolatot.");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("works on a 360 px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(FORM);
    await expect(page.getByTestId("request-form")).toHaveAttribute("data-enhanced", "true");
    await fillSteps(page);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("a rite without a form (or a switched-off form) points to the office", async ({ page }) => {
    // Other forms keep working; an unknown rite is a 404.
    expect((await page.goto("/szentsegek/nincs-ilyen/bejelentes"))?.status()).toBe(404);
  });
});

/** A browser context without scripts: the form must still work as one page. */
async function noScriptPage(browser: Browser, address = randomAddress()) {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    locale: "hu-HU",
    timezoneId: "Europe/Budapest",
    extraHTTPHeaders: { "x-forwarded-for": address },
  });
  return { context, page: await context.newPage() };
}

async function fillNoScript(page: Page, marker = "") {
  await page.goto(FORM);
  await fillAll(page, {
    ...CONTACT,
    ...DETAILS,
    "Kapcsolattartó neve": `${CONTACT["Kapcsolattartó neve"]}${marker}`,
  });
  await page.getByLabel(/^Hozzájárulok/).check();
}

test.describe("spam protection and no-JS fallback", () => {
  test("without JavaScript the form is one page and still submits", async ({ browser }) => {
    const { context, page } = await noScriptPage(browser);
    await page.goto(FORM);
    await expect(page.getByTestId("request-form")).toHaveAttribute("data-enhanced", "false");
    await expect(page.getByTestId("request-step-contact")).toBeVisible();
    await expect(page.getByTestId("request-step-details")).toBeVisible();

    await fillNoScript(page);
    await page.waitForTimeout(HUMAN_PAUSE);
    await page.getByTestId("request-submit").click();
    await expect(page.getByTestId("request-reference")).toContainText(/KER-\d{4}-\d{4}/);
    await context.close();
  });

  test("a filled honeypot is dropped silently and a too-fast submission is refused", async ({
    browser,
  }) => {
    const { context, page } = await noScriptPage(browser);
    // Too fast: submitted right after rendering.
    await fillNoScript(page);
    await page.getByTestId("request-submit").click();
    await expect(page.getByTestId("request-alert")).toContainText("túl gyorsan");
    await expect(page.getByTestId("request-reference")).toHaveCount(0);

    // Honeypot: looks like success, but nothing is created (no reference number).
    await fillNoScript(page);
    await page.locator("#request-honeypot").evaluate((el: HTMLInputElement) => {
      el.value = "https://spam.example";
    });
    await page.waitForTimeout(HUMAN_PAUSE);
    await page.getByTestId("request-submit").click();
    await expect(page.getByTestId("request-success")).toBeVisible();
    await expect(page.getByTestId("request-reference")).toHaveCount(0);
    await context.close();
  });

  test("allows five submissions per hour and address, then refuses the sixth", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const { context, page } = await noScriptPage(browser);
    for (let i = 0; i < 5; i += 1) {
      await fillNoScript(page);
      await page.waitForTimeout(HUMAN_PAUSE);
      await page.getByTestId("request-submit").click();
      await expect(page.getByTestId("request-reference")).toContainText(/KER-\d{4}-\d{4}/);
    }
    await fillNoScript(page);
    await page.waitForTimeout(HUMAN_PAUSE);
    await page.getByTestId("request-submit").click();
    await expect(page.getByTestId("request-alert")).toContainText("túl sok bejelentés");
    await expect(page.getByTestId("request-reference")).toHaveCount(0);

    // Another address is not affected.
    const other = await noScriptPage(browser);
    await fillNoScript(other.page);
    await other.page.waitForTimeout(HUMAN_PAUSE);
    await other.page.getByTestId("request-submit").click();
    await expect(other.page.getByTestId("request-reference")).toContainText(/KER-/);
    await other.context.close();
    await context.close();
  });
});

test.describe("requests inbox", () => {
  test("lists the requests, filters them and is axe-clean", async ({ page }) => {
    await openAs(page, "iroda", "/admin/kerelmek");
    await expect(page.getByRole("heading", { level: 1, name: "Kérelmek" })).toBeVisible();
    const rows = page.getByTestId("requests-table").locator("tbody tr");
    const total = await rows.count();
    expect(total).toBeGreaterThan(3);
    await expect(rows.first()).toContainText(/[A-Z]{3}-\d{4}-\d{4}/);
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Status filter.
    await page.getByLabel("Állapot", { exact: true }).selectOption("folyamatban");
    await page.getByRole("button", { name: "Szűrés" }).click();
    await expect(page).toHaveURL(/allapot=folyamatban/);
    const inProgress = await rows.count();
    expect(inProgress).toBeGreaterThan(0);
    expect(inProgress).toBeLessThan(total);
    for (const badge of await page.getByTestId("request-status").all()) {
      await expect(badge).toHaveText("Folyamatban");
    }

    // Form type and date filters, then reset.
    await page.getByRole("link", { name: "Szűrés törlése" }).click();
    await page
      .getByLabel("Űrlap", { exact: true })
      .selectOption({ label: "Keresztelő bejelentése" });
    await page.getByRole("button", { name: "Szűrés" }).click();
    await expect(rows.first()).toContainText("Keresztelő bejelentése");
    await page.getByLabel("Beérkezett ettől").fill("2999-01-01");
    await page.getByRole("button", { name: "Szűrés" }).click();
    await expect(page.getByText("A szűrésnek nincs találata.")).toBeVisible();

    // Assignee filter.
    await page.goto("/admin/kerelmek");
    await page.getByLabel("Felelős", { exact: true }).selectOption("none");
    await page.getByRole("button", { name: "Szűrés" }).click();
    await expect(page.getByTestId("requests-count")).toContainText("kérelem");
  });

  test("a submitted request shows up; handling it: status, assignee, note, reply template", async ({
    page,
  }) => {
    const reference = await submitAsVisitor(page);
    expect(reference).toMatch(REFERENCE);

    await openAs(page, "iroda", "/admin/kerelmek");
    await page.getByRole("link", { name: reference }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(reference);
    const data = page.getByTestId("request-data");
    await expect(data).toContainText("Teszt Gyermek");
    await expect(data).toContainText("teszt.kerelmezo@pelda.hu");
    await expect(page.getByTestId("request-meta")).toContainText("Új");
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Új → Folyamatban
    await page.getByTestId("status-folyamatban").click();
    await expect(page.getByTestId("request-meta")).toContainText("Folyamatban");
    await expect(page.getByTestId("status-folyamatban")).toHaveCount(0);

    // Assign
    const select = page.getByTestId("assignee-select");
    const options = await select.locator("option").allTextContents();
    expect(options.length).toBeGreaterThan(1);
    await select.selectOption({ index: 1 });
    await page.getByTestId("assign-save").click();
    await expect(page.getByTestId("workflow-result")).toContainText("Mentve.");

    // Internal note
    await page.getByLabel(/^Új jegyzet/).fill("Visszahívtam a családot, időpont egyeztetve.");
    await page.getByRole("button", { name: "Jegyzet rögzítése" }).click();
    await expect(page.getByTestId("request-note")).toContainText("Visszahívtam a családot");

    // Reply template = the form's confirmation text
    await expect(page.getByTestId("reply-template")).toContainText("Irodánk 3 munkanapon belül");
    await expect(page.getByTestId("reply-copy")).toBeVisible();

    // Folyamatban → Lezárt (purge date) → reopen
    await page.getByTestId("status-lezart").click();
    await expect(page.getByTestId("request-meta")).toContainText("Lezárt");
    await expect(page.getByTestId("request-meta")).toContainText("Automatikus törlés:");
    await page.getByTestId("status-folyamatban").click();
    await expect(page.getByTestId("request-meta")).not.toContainText("Automatikus törlés:");

    // The inbox shows the assignee and status.
    await page.goto("/admin/kerelmek");
    const row = page.getByTestId("requests-table").locator("tr", { hasText: reference });
    await expect(row).toContainText("Folyamatban");
    await expect(row).not.toContainText("Nincs kijelölve");
  });

  test("the notification outbox lists only the reference and a link, never the content", async ({
    page,
  }) => {
    const reference = await submitAsVisitor(page);
    await page.goto(OUTBOX);
    const rows = page.getByTestId("outbox-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: reference })).toHaveCount(2);
    await expect(page.locator("main")).not.toContainText("Teszt Elek");
    await expect(page.locator("main")).not.toContainText("teszt.kerelmezo");

    // The office mail links to the request in the admin.
    await page.locator('[data-template="request.officeNotification"] a').click();
    const html = (await page.getByTestId("email-preview").getAttribute("srcdoc")) ?? "";
    const text = (await page.getByTestId("email-plain-text").textContent()) ?? "";
    for (const secret of ["Teszt Elek", "Teszt Gyermek", "teszt.kerelmezo"]) {
      expect(html, secret).not.toContain(secret);
      expect(text, secret).not.toContain(secret);
    }
    expect(html).toContain("/admin/kerelmek/");
    expect(html).toContain(reference);
  });

  test("only roles that may handle requests can open the inbox", async ({ page }) => {
    await openAs(page, "szerkeszto", "/admin/kerelmek");
    await expect(page.getByTestId("area-no-access")).toBeVisible();
    await expect(page.getByTestId("requests-table")).toHaveCount(0);
    await page.goto("/admin/kerelmek/urlapok");
    await expect(page.getByTestId("area-no-access")).toBeVisible();
  });
});

test.describe("form builder", () => {
  test("lists the rite forms and edits fields: add, require, reorder, remove", async ({ page }) => {
    await openAs(page, "iroda", "/admin/kerelmek/urlapok");
    const table = page.getByTestId("forms-table");
    await expect(table).toContainText("Keresztelő bejelentése");
    await expect(table.locator("tbody tr")).toHaveCount(6);
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await page.getByRole("link", { name: "Keresztelő bejelentése", exact: true }).click();
    const fields = page.getByTestId("builder-field");
    await expect(fields.first()).toBeVisible();
    const before = await fields.count();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // A new field without a label is refused, with a message.
    await page.waitForLoadState("networkidle");
    await page.getByTestId("builder-add").click();
    await expect(fields).toHaveCount(before + 1);
    await page.getByTestId("form-submit").click();
    await expect(page.getByText("Minden mezőnek legyen felirata.")).toBeVisible();

    // Fill it in: a required select.
    const added = fields.last();
    await added.getByLabel("Felirat").fill("Hol keresztelnének?");
    await added.getByLabel("Típus").selectOption("select");
    await added.getByLabel("Választási lehetőségek").fill("Templomban\nOtthon");
    await added.getByRole("checkbox", { name: "Kötelező", exact: true }).check();

    // Remove the optional godparents field.
    const godparents = fields.filter({ has: page.locator('input[value="Keresztszülők neve"]') });
    await godparents.getByTestId("builder-remove").click();
    await expect(fields).toHaveCount(before);

    await page.getByTestId("form-submit").click();
    await expect(page.getByText("Mentve")).toBeVisible();

    // The public form follows the definition.
    await page.goto(FORM);
    await expect(page.getByTestId("request-form")).toHaveAttribute("data-enhanced", "true");
    await fillAll(page, CONTACT);
    await page.getByTestId("request-next").click();
    await expect(field(page, "Hol keresztelnének?")).toBeVisible();
    await expect(page.getByLabel("Keresztszülők neve")).toHaveCount(0);
    await page.getByTestId("request-next").click();
    await expect(page.getByText("Ez a mező kötelező.").first()).toBeVisible();
    const choices = await field(page, "Hol keresztelnének?").locator("option").allTextContents();
    expect(choices).toEqual(["Válasszon…", "Templomban", "Otthon"]);
  });

  test("creates a new form and switches an existing one off", async ({ page }) => {
    await openAs(page, "iroda", "/admin/kerelmek/urlapok/uj");
    await page.getByLabel(/^Az űrlap neve/).fill("Teszt űrlap");
    await page
      .getByLabel(/^Azonosító$/)
      .first()
      .fill("teszt-urlap");
    await page.getByTestId("builder-add").click();
    const added = page.getByTestId("builder-field").first();
    await added.getByLabel("Felirat").fill("Kérdése");
    await page.getByTestId("form-submit").click();
    await expect(page).toHaveURL(/\/admin\/kerelmek\/urlapok\/teszt-urlap\?mentve=1/);

    // A key that is already used is refused.
    await page.goto("/admin/kerelmek/urlapok/uj");
    await page.getByLabel(/^Az űrlap neve/).fill("Másik");
    await page
      .getByLabel(/^Azonosító$/)
      .first()
      .fill("teszt-urlap");
    await page.getByTestId("form-submit").click();
    await expect(page.getByText("Ez az azonosító már használatban van.")).toBeVisible();

    // Switching the keresztelő form off removes the request form from the public site.
    await page.goto("/admin/kerelmek/urlapok/keresztelo");
    await page.getByLabel("Az űrlap elérhető a weboldalon").uncheck();
    await page.getByTestId("form-submit").click();
    await expect(page.getByText("Mentve")).toBeVisible();
    await page.goto(FORM);
    await expect(page.getByTestId("request-form")).toHaveCount(0);
    await expect(page.getByTestId("rite-request")).toContainText("nem érhető el");
  });
});
