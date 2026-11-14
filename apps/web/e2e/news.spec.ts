import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { CHURCHES, axeSeriousOrCritical, switchContext } from "./demo-helpers";

/**
 * D-13 [UI]: public news — list (12 per page, `?oldal=` links), post detail with Open Graph and
 * `NewsArticle` JSON-LD, share links without third-party scripts. The demo seed is anchored on the
 * current date: the default church has 15 visible posts, one scheduled in 14 days, one draft, one
 * that expired 2 days ago and one that expires in 40 days. Time is moved with the demo-only clock
 * cookie (server: the visitor's demo store) and Playwright's clock (browser).
 */
const DAY = 86_400_000;
const SCHEDULED = { slug: "mikulas-unnep-a-nagyteremben", title: "Mikulás-ünnep a nagyteremben" };
const EXPIRED = { slug: "jelentkezes-a-hittantaborba", title: "Jelentkezés a téli hittantáborba" };
const EXPIRING = { slug: "kori-hangverseny", title: "Adventi hangverseny a templomban" };
const DRAFT = "lelkigyakorlat-meghirdetese";
const POST = { slug: "adventi-lelkinap", title: "Adventi lelkinap a plébánián" };

async function openMainNav(page: Page) {
  const toggle = page.getByRole("button", { name: "Menü megnyitása" });
  if (await toggle.isVisible()) await toggle.click();
  return page.getByRole("navigation", { name: "Főmenü" });
}

/** Moves "now" for this visitor: the server-side demo clock and the browser clock. */
async function travelTo(page: Page, context: BrowserContext, at: Date) {
  await context.addCookies([
    { name: "churchy_demo_now", value: at.toISOString(), url: `${new URL(page.url()).origin}/` },
  ]);
  await page.clock.setFixedTime(at);
}

const items = (page: Page) => page.getByTestId("news-item");

/** Slugs of every list page, following the pagination links. */
async function allListedSlugs(page: Page): Promise<string[]> {
  await page.goto("/hirek");
  const slugs: string[] = [];
  for (;;) {
    slugs.push(...(await items(page).evaluateAll((els) => els.map((el) => el.dataset.slug!))));
    const next = page.getByRole("link", { name: "Következő oldal" });
    if ((await next.count()) === 0) return slugs;
    await next.click();
  }
}

test.describe("news list", () => {
  test("is in the main navigation and pages 12 posts at a time, newest first", async ({ page }) => {
    await page.goto("/");
    await (await openMainNav(page)).getByRole("link", { name: "Hírek" }).click();
    await expect(page).toHaveURL(/\/hirek$/);
    await expect(page.getByRole("heading", { level: 1, name: "Hírek" })).toBeVisible();
    await expect(await openMainNav(page)).toBeVisible();

    await expect(items(page)).toHaveCount(12);
    const firstPage = await items(page).evaluateAll((els) => els.map((el) => el.dataset.slug!));
    const dates = await page
      .getByTestId("news-item")
      .evaluateAll((els) => els.map((el) => Date.parse(el.dataset.published!)));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    await expect(page.getByTestId("news-page-status")).toHaveText("1. oldal / 2");
    await expect(page.getByRole("link", { name: "1. oldal" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Pagination is plain links (`?oldal=`).
    const next = page.getByRole("link", { name: "Következő oldal" });
    await expect(next).toHaveAttribute("href", "/hirek?oldal=2");
    await next.click();
    await expect(page).toHaveURL(/\/hirek\?oldal=2$/);
    await expect(items(page)).toHaveCount(3);
    const secondPage = await items(page).evaluateAll((els) => els.map((el) => el.dataset.slug!));
    expect(secondPage.filter((s) => firstPage.includes(s))).toEqual([]);
    await expect(page.getByRole("link", { name: "Következő oldal" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Előző oldal" })).toHaveAttribute("href", "/hirek");
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    expect((await page.goto("/hirek?oldal=3"))?.status()).toBe(404);
    // An invalid page number is page 1.
    await page.goto("/hirek?oldal=abc");
    await expect(items(page)).toHaveCount(12);
  });

  test("hides scheduled, draft and expired posts", async ({ page }) => {
    const slugs = await allListedSlugs(page);
    expect(slugs).toHaveLength(15);
    expect(slugs).toContain(EXPIRING.slug);
    for (const hidden of [SCHEDULED.slug, EXPIRED.slug, DRAFT]) {
      expect(slugs).not.toContain(hidden);
      expect((await page.goto(`/hirek/${hidden}`))?.status(), hidden).toBe(404);
    }
  });

  test("evaluates visibility against the (mocked) clock", async ({ page, context }) => {
    await page.goto("/hirek");
    const now = Date.now();

    // 15 days ahead: the scheduled post is out; the expiring one is still shown.
    await travelTo(page, context, new Date(now + 15 * DAY));
    let slugs = await allListedSlugs(page);
    expect(slugs).toContain(SCHEDULED.slug);
    expect(slugs).toContain(EXPIRING.slug);
    expect(slugs).not.toContain(EXPIRED.slug);
    await page.goto(`/hirek/${SCHEDULED.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(SCHEDULED.title);

    // 42 days ahead: the expiring post has expired.
    await travelTo(page, context, new Date(now + 42 * DAY));
    slugs = await allListedSlugs(page);
    expect(slugs).not.toContain(EXPIRING.slug);
    expect((await page.goto(`/hirek/${EXPIRING.slug}`))?.status()).toBe(404);

    // 5 days back: the expired post is still live, the newest posts are not yet published.
    await travelTo(page, context, new Date(now - 5 * DAY));
    slugs = await allListedSlugs(page);
    expect(slugs).toContain(EXPIRED.slug);
    expect(slugs).not.toContain(POST.slug);
    expect(slugs).not.toContain(SCHEDULED.slug);
    expect((await page.goto(`/hirek/${POST.slug}`))?.status()).toBe(404);
  });
});

test.describe("news post", () => {
  test("renders the post with Open Graph and NewsArticle data", async ({ page }) => {
    await page.goto("/hirek");
    await page.getByRole("link", { name: POST.title }).click();
    await expect(page).toHaveURL(new RegExp(`/hirek/${POST.slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(POST.title);
    await expect(page.getByTestId("news-published")).toHaveText(
      /^\d{4}\. [a-zá-ű]+ \d{1,2}\., [a-zá-ű]+$/,
    );
    await expect(page.locator("[data-rich-text] p").first()).toContainText("adventi lelkinapot");
    await expect(page.getByRole("link", { name: "Vissza a hírekhez" })).toHaveAttribute(
      "href",
      "/hirek",
    );

    const og = async (property: string) =>
      page.locator(`meta[property="${property}"]`).getAttribute("content");
    expect(await og("og:type")).toBe("article");
    expect(await og("og:title")).toBe(POST.title);
    expect(await og("og:url")).toMatch(new RegExp(`^http://localhost:\\d+/hirek/${POST.slug}$`));
    expect(await og("og:locale")).toBe("hu_HU");
    expect(await og("article:published_time")).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const ld = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    ) as Record<string, unknown>;
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: POST.title,
      inLanguage: "hu-HU",
    });
    expect(ld.url).toBe(await og("og:url"));

    // *Kapcsolódó hírek*: other posts of the first category, never the post itself.
    const related = page.getByTestId("news-related");
    await expect(related.getByRole("link")).not.toHaveCount(0);
    await expect(related.getByRole("link", { name: POST.title })).toHaveCount(0);

    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("share links load no third-party script", async ({ page, context, browserName }) => {
    const foreign: string[] = [];
    page.on("request", (request) => {
      const { hostname, protocol } = new URL(request.url());
      if (protocol !== "data:" && protocol !== "blob:" && hostname !== "localhost") {
        foreign.push(request.url());
      }
    });
    await page.goto(`/hirek/${POST.slug}`);
    const share = page.getByTestId("share-links");
    await expect(share.getByRole("heading", { name: "Megosztás" })).toBeVisible();

    const url = new URL(page.url()).href;
    const facebook = share.getByRole("link", { name: /Megosztás Facebookon/ });
    await expect(facebook).toHaveAttribute(
      "href",
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    );
    await expect(facebook).toHaveAttribute("target", "_blank");
    await expect(facebook).toHaveAttribute("rel", "noopener noreferrer");
    await expect(share.getByRole("link", { name: "Küldés Messengeren" })).toHaveAttribute(
      "href",
      `fb-messenger://share/?link=${encodeURIComponent(url)}`,
    );

    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    }
    await share.getByRole("button", { name: "Hivatkozás másolása" }).click();
    await expect(page.getByTestId("share-status")).toHaveText(
      "A hivatkozást a vágólapra másoltuk.",
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

    // No script (or any other request) left the site, and no Facebook SDK is on the page.
    expect(foreign).toEqual([]);
    const scripts = await page
      .locator("script[src]")
      .evaluateAll((els) => els.map((el) => (el as HTMLScriptElement).src));
    expect(scripts.filter((src) => new URL(src).hostname !== "localhost")).toEqual([]);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("copy-link reports when the clipboard is unavailable", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    });
    await page.goto(`/hirek/${POST.slug}`);
    await page.getByRole("button", { name: "Hivatkozás másolása" }).click();
    await expect(page.getByTestId("share-status")).toContainText(`/hirek/${POST.slug}`);
  });
});

test("news work on the 3 demo churches", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  for (const church of [CHURCHES.catholic, CHURCHES.reformed, CHURCHES.baptist]) {
    await switchContext(page, church);
    await page.goto("/hirek");
    const count = await items(page).count();
    expect(count, church).toBeGreaterThanOrEqual(9);
    const first = page.getByTestId("news-list").getByRole("heading", { level: 3 }).first();
    const title = (await first.textContent())!.trim();
    await first.getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 }), church).toHaveText(title);
    await expect(page.getByTestId("share-links"), church).toBeVisible();
    expect(await axeSeriousOrCritical(page), church).toEqual([]);
  }
});
