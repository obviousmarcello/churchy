import { expect, test, type Page } from "@playwright/test";
import { CHURCHES, axeSeriousOrCritical, switchContext } from "./demo-helpers";

/**
 * D-15 [UI]: public events — list and month views, event detail with `Event` JSON-LD and the
 * `.ics` feeds. Runs against the demo seed, which is anchored on the current date, so recurring
 * events always have upcoming occurrences.
 */
const NO_DEMO = `http://localhost:${process.env.NO_DEMO_PORT ?? 3102}`;

/** Today's date and ISO weekday in Europe/Budapest. */
function budapestToday(): { date: string; year: number; month: number } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date());
  return { date, year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

const isoWeekday = (date: string): number => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

async function openMainNav(page: Page) {
  const toggle = page.getByRole("button", { name: "Menü megnyitása" });
  if (await toggle.isVisible()) await toggle.click();
  return page.getByRole("navigation", { name: "Főmenü" });
}

test.describe("events list", () => {
  test("is in the main navigation and lists upcoming occurrences with rule text", async ({
    page,
  }) => {
    await page.goto("/");
    await (await openMainNav(page)).getByRole("link", { name: "Események" }).click();
    await expect(page).toHaveURL(/\/esemenyek$/);
    await expect(page.getByRole("heading", { level: 1, name: "Események" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lista" })).toHaveAttribute("aria-current", "page");

    const items = page.getByTestId("event-item");
    expect(await items.count()).toBeGreaterThan(3);
    // Occurrences are sorted by date and none lies in the past.
    const dates = await items.evaluateAll((els) => els.map((el) => el.getAttribute("data-date")!));
    expect(dates).toEqual([...dates].sort());
    expect(dates[0]! >= budapestToday().date).toBe(true);

    const hittan = items.filter({ hasText: "Hittanóra" }).first();
    await expect(hittan).toContainText("Minden kedden");
    await expect(hittan).toContainText(/\d{4}\. [a-zá-ű]+ \d{1,2}\., kedd/);
    await expect(items.filter({ hasText: "Ifjúsági est" }).first()).toContainText(
      "Minden hónap első és harmadik péntekén",
    );
    // Staff and team events are never public.
    await expect(page.getByText("Munkatársi értekezlet")).toHaveCount(0);
    await expect(page.getByText("Kórusi próba")).toHaveCount(0);

    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("pages forward and back by four weeks", async ({ page }) => {
    await page.goto("/esemenyek");
    const first = await page.getByTestId("event-item").first().getAttribute("data-date");
    await page.getByTestId("events-later").click();
    await expect(page).toHaveURL(/\?tol=\d{4}-\d{2}-\d{2}$/);
    const next = await page.getByTestId("event-item").first().getAttribute("data-date");
    expect(next! > first!).toBe(true);
    await page.getByTestId("events-earlier").click();
    await expect(page).toHaveURL(/\/esemenyek$/);
    await expect(page.getByTestId("events-earlier")).toHaveCount(0);
  });

  test("works for the three demo churches", async ({ page }) => {
    const expected: [string, string][] = [
      [CHURCHES.catholic, "Bibliaóra"],
      [CHURCHES.reformed, "Nőszövetségi délután"],
      [CHURCHES.baptist, "Baba-mama kör"],
    ];
    await page.goto("/");
    for (const [church, title] of expected) {
      if (church !== CHURCHES.catholic) await switchContext(page, church);
      await page.goto("/esemenyek");
      await expect(page.getByTestId("event-item").filter({ hasText: title }).first()).toBeVisible();
    }
  });
});

test.describe("month view", () => {
  test("is a Monday-first month grid with the events on their days", async ({ page }) => {
    const { year, month } = budapestToday();
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    await page.goto("/esemenyek");
    await page.getByRole("link", { name: "Havi naptár" }).click();
    await expect(page).toHaveURL(/\/esemenyek\/naptar$/);
    await expect(page.getByTestId("month-title")).toContainText(`${year}.`);

    const grid = page.getByTestId("month-grid");
    // Leading blanks: one per weekday before the 1st, counting from Monday.
    const leading = await grid.evaluate((ol) =>
      [...ol.children].findIndex((li) => li.hasAttribute("data-date")),
    );
    expect(leading).toBe(isoWeekday(first) - 1);
    await expect(grid.locator(`li[data-date="${first}"]`)).toBeAttached();

    // Weekly Tuesday event: every cell listing it is a Tuesday.
    const cells = grid.locator("li[data-date]").filter({ hasText: "Hittanóra" });
    expect(await cells.count()).toBeGreaterThanOrEqual(4);
    for (const date of await cells.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-date")!),
    )) {
      expect(isoWeekday(date), date).toBe(2);
    }

    if (test.info().project.name === "desktop") {
      await expect(page.getByTestId("month-weekdays").locator("div").first()).toHaveText("H");
      await expect(page.getByTestId("month-weekdays").locator("div").last()).toHaveText("V");
    }
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await page.getByTestId("month-next").click();
    await expect(page).toHaveURL(/honap=\d{4}-\d{2}$/);
    const nextMonth = month === 12 ? 1 : month + 1;
    await expect(page).toHaveURL(new RegExp(`honap=\\d{4}-${String(nextMonth).padStart(2, "0")}$`));
    await expect(page.getByRole("link", { name: "Aktuális hónap" })).toBeVisible();
  });
});

test.describe("event detail", () => {
  test("shows date, Hungarian recurrence text, location, calendar links and Event JSON-LD", async ({
    page,
  }) => {
    await page.goto("/esemenyek");
    await page
      .getByTestId("event-item")
      .filter({ hasText: "Ifjúsági est" })
      .first()
      .getByRole("link")
      .click();
    await expect(page).toHaveURL(/\/esemenyek\/ifjusagi-est\?datum=\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Ifjúsági est" })).toBeVisible();
    await expect(page.getByTestId("event-when")).toContainText(/, péntek/);
    await expect(page.getByTestId("event-recurrence")).toHaveText(
      "Minden hónap első és harmadik péntekén 19:00-kor",
    );
    await expect(page.getByTestId("event-where")).toContainText("Szent Tivadar-templom");
    await expect(page.getByTestId("event-upcoming").getByRole("listitem")).toHaveCount(6);
    await expect(page.getByTestId("event-ics")).toHaveAttribute(
      "href",
      "/esemenyek/ifjusagi-est/naptar.ics",
    );
    await expect(page.getByRole("link", { name: /Google Naptár/ })).toHaveAttribute(
      "href",
      /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE.*recur=RRULE%3AFREQ%3DMONTHLY/,
    );

    const jsonLd = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    );
    const datum = new URL(page.url()).searchParams.get("datum");
    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Ifjúsági est",
      eventStatus: "https://schema.org/EventScheduled",
      location: { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "HU" } },
      organizer: { "@type": "Organization", name: "Szent Tivadar Plébánia" },
    });
    expect(jsonLd.startDate).toMatch(new RegExp(`^${datum}T19:00:00\\+0[12]:00$`));

    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("unknown and non-public events are not found", async ({ page }) => {
    for (const slug of ["nincs-ilyen-esemeny", "munkatarsi-ertekezlet", "korusi-proba"]) {
      expect((await page.goto(`/esemenyek/${slug}`))?.status(), slug).toBe(404);
    }
  });
});

test.describe("iCalendar feeds", () => {
  test("the feed and per-event files are RFC 5545 calendars and set no cookies", async ({
    playwright,
  }) => {
    // A fresh client without cookies, like a calendar app subscribing to the feed.
    for (const base of [test.info().project.use.baseURL!, NO_DEMO]) {
      const request = await playwright.request.newContext({ baseURL: base });
      const feed = await request.get("/esemenyek.ics");
      expect(feed.status(), base).toBe(200);
      expect(feed.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
      expect(feed.headers()["set-cookie"], base).toBeUndefined();
      const body = await feed.text();
      expect(body.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
      expect(body.endsWith("END:VCALENDAR\r\n")).toBe(true);
      expect(body).toContain("BEGIN:VTIMEZONE\r\nTZID:Europe/Budapest\r\n");
      expect(body).toContain("X-WR-CALNAME:Szent Tivadar Plébánia – események");
      expect(body).toContain("SUMMARY:Hittanóra\r\n");
      expect(body).toMatch(/DTSTART;TZID=Europe\/Budapest:\d{8}T160000\r\nDTEND/);
      expect(body).not.toContain("Munkatársi értekezlet");
      const encoder = new TextEncoder();
      for (const line of body.split("\r\n"))
        expect(encoder.encode(line).length).toBeLessThanOrEqual(75);

      const single = await request.get("/esemenyek/ifjusagi-est/naptar.ics");
      expect(single.status()).toBe(200);
      expect(single.headers()["content-disposition"]).toBe(
        'attachment; filename="ifjusagi-est.ics"',
      );
      expect(single.headers()["set-cookie"]).toBeUndefined();
      const one = await single.text();
      expect(one.match(/BEGIN:VEVENT/g)).toHaveLength(1);
      expect(one).toContain("RRULE:FREQ=MONTHLY;BYDAY=1FR,3FR\r\n");

      expect((await request.get("/esemenyek/nincs-ilyen-esemeny/naptar.ics")).status()).toBe(404);
      await request.dispose();
    }
  });
});
