import { expect, test, type Page, type Request } from "@playwright/test";
import { CHURCHES, axeSeriousOrCritical, switchContext } from "./demo-helpers";

/**
 * D-12: location pages, office hours, the click-to-load map facade and the contact form.
 * The default demo church is the Catholic parish (Szent Tivadar Plébánia).
 */

const CHURCH_PATH = "/templomaink/szent-tivadar-templom";
const OUTBOX = "/fejlesztes/kimeno-levelek";

/** Every request the page makes to a host other than the app's own. */
function thirdPartyRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    const { hostname, protocol } = new URL(request.url());
    if (protocol === "data:" || protocol === "blob:") return;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") seen.push(request);
  });
  return seen;
}

/** The OSM embed is answered locally, so the test never depends on (or calls) the real service. */
async function stubOpenStreetMap(page: Page) {
  await page.route("https://www.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>OSM</title>" }),
  );
}

/** The Monday inside the Christmas break the demo seed sets (Dec 24 – Jan 1, current or next). */
function christmasMonday(): Date {
  const today = new Date();
  const year =
    today.getMonth() === 0 && today.getDate() === 1 ? today.getFullYear() - 1 : today.getFullYear();
  for (let day = 24; ; day++) {
    const date = new Date(Date.UTC(year, 11, day, 9, 0)); // 10:00 Budapest (CET)
    if (date.getUTCDay() === 1) return date;
  }
}

test.describe("location pages", () => {
  test("list links to a detail page with address, route link, hours, map facade and accessibility", async ({
    page,
  }) => {
    await page.goto("/templomaink");
    await expect(page.getByRole("heading", { level: 1, name: "Templomaink" })).toBeVisible();
    const list = page.getByTestId("location-list");
    await expect(list.getByRole("link")).toHaveCount(3);
    await list.getByRole("link", { name: "Szent Tivadar-templom" }).click();

    await expect(page).toHaveURL(CHURCH_PATH);
    await expect(
      page.getByRole("heading", { level: 1, name: "Szent Tivadar-templom" }),
    ).toBeVisible();
    await expect(page.getByTestId("location-address")).toHaveText("2999 Dunaliget, Templom tér 3.");

    const route = page.getByTestId("route-link");
    await expect(route).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=47.6521%2C19.0612",
    );
    await expect(route).toHaveAttribute("rel", /noopener/);

    await expect(page.getByTestId("map-facade")).toBeVisible();
    await expect(page.getByTestId("map-load")).toHaveText("Térkép betöltése");
    await expect(page.getByTestId("location-hours-row")).toHaveCount(7);

    const access = page.getByTestId("accessibility");
    await expect(access.locator('[data-feature="wheelchair"]')).toHaveText(
      "Kerekesszékkel megközelíthető: Van",
    );
    await expect(access).toContainText("A rámpa a nyugati bejáratnál található.");

    const jsonLd = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    ) as Record<string, unknown>;
    expect(jsonLd).toMatchObject({ "@type": "Church", name: "Szent Tivadar-templom" });
  });

  test("an unknown location is a 404 with the demo banner", async ({ page }) => {
    const response = await page.goto("/templomaink/nincs-ilyen");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("demo-banner")).toBeVisible();
  });
});

test.describe("map facade", () => {
  test("no third-party request is made before the facade is clicked", async ({ page }) => {
    await stubOpenStreetMap(page);
    const external = thirdPartyRequests(page);

    for (const path of ["/kapcsolat", "/templomaink", CHURCH_PATH]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(external.map((r) => r.url())).toEqual([]);
    await expect(page.locator("iframe")).toHaveCount(0);

    // The click — and only the click — loads the OpenStreetMap embed.
    await page.getByTestId("map-load").click();
    const frame = page.getByTestId("map-embed").locator("iframe");
    await expect(frame).toHaveAttribute(
      "src",
      /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/,
    );
    await expect(frame).toHaveAttribute("title", "Térkép: Szent Tivadar-templom");
    await expect
      .poll(() => external.map((r) => new URL(r.url()).hostname))
      .toContain("www.openstreetmap.org");
    expect(new Set(external.map((r) => new URL(r.url()).hostname))).toEqual(
      new Set(["www.openstreetmap.org"]),
    );
  });
});

test.describe("office hours", () => {
  test("today is highlighted and the status is computed in Budapest time", async ({ page }) => {
    // Monday 2026-11-16, 10:30 Budapest: the parish office is open 09:00–12:00.
    await page.clock.setFixedTime(new Date("2026-11-16T10:30:00+01:00"));
    await page.goto("/kapcsolat");
    const hours = page.getByTestId("office-hours");
    await expect(page.getByTestId("office-hours-status")).toHaveText("Most nyitva");
    await expect(page.getByTestId("office-hours-next")).toHaveText("12:00-ig");
    const today = hours.locator('[data-testid="office-hours-row"][data-today="true"]');
    await expect(today).toHaveCount(1);
    await expect(today).toHaveAttribute("aria-current", "date");
    await expect(today.getByRole("rowheader")).toContainText("Hétfő");
    await expect(today).toContainText("09:00–12:00");
  });

  test("closed outside the hours, with the next opening", async ({ page }) => {
    // Tuesday 2026-11-17 08:00 → opens Wednesday 14:00.
    await page.clock.setFixedTime(new Date("2026-11-17T08:00:00+01:00"));
    await page.goto("/kapcsolat");
    await expect(page.getByTestId("office-hours-status")).toHaveText("Most zárva");
    await expect(page.getByTestId("office-hours-next")).toHaveText("Legközelebb: holnap, 14:00");
  });

  test("the Christmas break overrides the regular Monday hours", async ({ page }) => {
    await page.clock.setFixedTime(christmasMonday());
    await page.goto("/kapcsolat");
    await expect(page.getByTestId("office-hours-status")).toHaveText("Most zárva");
    const today = page.locator('[data-testid="office-hours-row"][data-today="true"]');
    await expect(today).toContainText("Hétfő");
    await expect(today).toContainText("Zárva");
    await expect(page.getByTestId("office-hours-today-exception")).toBeVisible();
    await expect(page.getByTestId("office-hours-exceptions")).toContainText(
      /Zárva: \d{4}\. dec\. 24\. – \d{4}\. jan\. 1\./,
    );
    await expect(page.getByTestId("office-hours-exceptions")).toContainText(
      "A plébániai iroda karácsonyi szünete.",
    );
  });
});

test.describe("contact form", () => {
  test("Kapcsolat is in the main navigation", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Főmenü" });
    const toggle = page.getByRole("button", { name: "Menü megnyitása" });
    if (await toggle.isVisible()) await toggle.click();
    await nav.getByRole("link", { name: "Kapcsolat" }).click();
    await expect(page).toHaveURL("/kapcsolat");
    await expect(page.getByRole("heading", { level: 1, name: "Kapcsolat" })).toBeVisible();
  });

  test("validates in Hungarian and keeps what was typed", async ({ page }) => {
    await page.goto("/kapcsolat");
    const form = page.getByTestId("contact-form");
    await form.getByRole("button", { name: "Üzenet küldése" }).click();
    await expect(form.getByRole("alert")).toContainText("Kérjük, javítsa a megjelölt mezőket.");
    await expect(form.getByLabel("Név", { exact: true })).toHaveAccessibleDescription(
      "Ez a mező kötelező.",
    );
    await expect(form.getByText("Az üzenet elküldéséhez el kell fogadnia")).toBeVisible();

    await form.getByLabel("Név", { exact: true }).fill("Minta Mária");
    await form.getByLabel("E-mail-cím", { exact: true }).fill("nem-email");
    await form.getByLabel("Üzenet", { exact: true }).fill("rövid");
    await form.getByRole("button", { name: "Üzenet küldése" }).click();
    await expect(form.getByText("Adjon meg érvényes e-mail-címet.")).toBeVisible();
    await expect(form.getByText("Legalább 10 karakter szükséges.")).toBeVisible();
    await expect(form.getByLabel("Név", { exact: true })).toHaveValue("Minta Mária");

    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("a valid message is sent and appears in the outbox", async ({ page }) => {
    await page.goto(OUTBOX);
    await page.getByTestId("outbox-clear").click();
    await expect(page.getByTestId("outbox-count")).toHaveText("0 üzenet");

    await page.goto("/kapcsolat");
    const form = page.getByTestId("contact-form");
    await form.getByLabel("Név", { exact: true }).fill("Minta Mária");
    await form.getByLabel("E-mail-cím", { exact: true }).fill("minta.maria@example.test");
    await form.getByRole("textbox", { name: /^Telefonszám/ }).fill("+36 30 123 4567");
    await form.getByLabel("Tárgy", { exact: true }).fill("Érdeklődés a hittanról");
    await form
      .getByLabel("Üzenet", { exact: true })
      .fill("Kitalált üzenet: mikor kezdődik a hittan?\nKöszönöm.");
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Üzenet küldése" }).click();

    const success = page.getByTestId("contact-success");
    await expect(success).toContainText("Köszönjük, üzenetét megkaptuk!");
    const reference = (await page.getByTestId("contact-reference").textContent())?.match(
      /KAP-\d{4}-\d{4}/,
    )?.[0];
    expect(reference).toBeTruthy();

    await page.goto(OUTBOX);
    const row = page.locator('[data-template="contact.message"]');
    await expect(row).toHaveCount(1);
    await row.locator("a").click();
    const body = page.frameLocator('[data-testid="email-preview"]').locator("body");
    await expect(body).toContainText(reference!);
    await expect(body).toContainText("Minta Mária");
    await expect(body).toContainText("mikor kezdődik a hittan?");
  });

  test("the honeypot silently drops bot submissions", async ({ page }) => {
    await page.goto(OUTBOX);
    await page.getByTestId("outbox-clear").click();
    await expect(page.getByTestId("outbox-count")).toHaveText("0 üzenet");

    await page.goto("/kapcsolat");
    const form = page.getByTestId("contact-form");
    const honeypot = form.locator('input[name="weboldal"]');
    await expect(honeypot).toHaveAttribute("tabindex", "-1");
    await form.getByLabel("Név", { exact: true }).fill("Robot");
    await form.getByLabel("E-mail-cím", { exact: true }).fill("robot@example.test");
    await form.getByLabel("Tárgy", { exact: true }).fill("Ajánlat");
    await form.getByLabel("Üzenet", { exact: true }).fill("Ez egy automatikus üzenet.");
    await form.getByRole("checkbox").check();
    await honeypot.fill("https://spam.example", { force: true });
    await form.getByRole("button", { name: "Üzenet küldése" }).click();

    await expect(page.getByTestId("contact-success")).toBeVisible();
    await expect(page.getByTestId("contact-reference")).toHaveCount(0);
    await page.goto(OUTBOX);
    await expect(page.getByTestId("outbox-count")).toHaveText("0 üzenet");
  });
});

test.describe("all three demo churches", () => {
  for (const church of [CHURCHES.catholic, CHURCHES.reformed, CHURCHES.baptist]) {
    test(`${church}: contact page and location pages`, async ({ page }) => {
      await page.goto("/kapcsolat");
      await switchContext(page, church);
      await expect(page.getByTestId("office-hours-row")).toHaveCount(7);
      await expect(page.getByTestId("contact-details")).toContainText("Dunaliget");
      const first = page.getByTestId("location-list").getByRole("link").first();
      const name = (await first.textContent()) ?? "";
      await first.click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(name.trim());
      await expect(page.getByTestId("location-address")).toContainText("Dunaliget");
      await expect(page.getByTestId("map-facade")).toBeVisible();
    });
  }
});

test.describe("accessibility", () => {
  for (const path of ["/kapcsolat", "/templomaink", CHURCH_PATH]) {
    test(`axe: 0 serious/critical on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(
        page.getByTestId(path === "/templomaink" ? "location-list" : "map-facade"),
      ).toBeVisible();
      expect(await axeSeriousOrCritical(page)).toEqual([]);
    });
  }

  test("axe: 0 serious/critical with the map loaded", async ({ page }) => {
    await stubOpenStreetMap(page);
    await page.goto(CHURCH_PATH);
    await page.getByTestId("map-load").click();
    await expect(page.getByTestId("map-embed")).toBeVisible();
    expect(await axeSeriousOrCritical(page, "main")).toEqual([]);
  });
});
