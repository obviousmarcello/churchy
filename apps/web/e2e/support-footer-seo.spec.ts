import { expect, test, type Page } from "@playwright/test";
import { CHURCHES, axeSeriousOrCritical, banner, switchContext } from "./demo-helpers";

/**
 * D-17: the support page with the instant-payment QR code, the footer on every public page, and
 * the SEO basics (sitemap.xml, robots.txt, canonical URLs, `lang="hu"`, the church's structured
 * data). The default demo church is the Catholic parish (Szent Tivadar Plébánia); all demo data is
 * fictitious (bank code 999 is no real bank).
 */

const NO_DEMO = `http://localhost:${process.env.NO_DEMO_PORT ?? 3102}`;

type ChurchKey = "catholic" | "reformed" | "baptist";

const EXPECTED: Record<
  ChurchKey,
  {
    account: string;
    reference: string;
    technicalNumber: string;
    foundationTax: string | null;
    address: string;
    hoursRows: number;
    social: string[];
    schedulePath: string;
    jsonLdType: string;
  }
> = {
  catholic: {
    account: "99999999-11111111-00000001",
    reference: "Egyházi hozzájárulás",
    technicalNumber: "DEMO-0001",
    foundationTax: "19999999-1-13",
    address: "2999 Dunaliget, Templom tér 3.",
    hoursRows: 3,
    social: ["youtube"],
    schedulePath: "/miserend",
    jsonLdType: "CatholicChurch",
  },
  reformed: {
    account: "99999999-22222222-00000002",
    reference: "Egyházfenntartói járulék",
    technicalNumber: "DEMO-0002",
    foundationTax: null,
    address: "2999 Dunaliget, Kálvin tér 2.",
    hoursRows: 2,
    social: ["facebook", "youtube"],
    schedulePath: "/istentiszteleti-rend",
    jsonLdType: "Church",
  },
  baptist: {
    account: "99999999-33333333-00000003",
    reference: "Adomány",
    technicalNumber: "DEMO-0003",
    foundationTax: null,
    address: "2999 Dunaliget, Kertész utca 17.",
    hoursRows: 3,
    social: ["facebook", "youtube", "instagram"],
    schedulePath: "/alkalmaink",
    jsonLdType: "Church",
  },
};

async function openAs(page: Page, church: ChurchKey, path: string) {
  await page.goto(path);
  if (church !== "catholic") {
    await switchContext(page, CHURCHES[church]);
    await page.goto(path);
  }
}

test.describe("support page", () => {
  test("shows the account, copy button, reference, QR code and 1% section (Catholic)", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const response = await page.goto("/tamogatas");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Támogatás" })).toBeVisible();
    await expect(banner(page)).toBeVisible();

    await expect(page.getByTestId("giving-beneficiary")).toHaveText("Szent Tivadar Plébánia");
    await expect(page.getByTestId("giving-account")).toHaveText("99999999-11111111-00000001");
    await expect(page.getByTestId("giving-iban")).toHaveText(/^HU\d{2}( \d{4}){6}$/);
    await expect(page.getByTestId("giving-reference")).toHaveText("Egyházi hozzájárulás");

    await page.getByTestId("copy-account").click();
    await expect(page.getByTestId("copy-account-status")).toHaveText("Vágólapra másolva.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "99999999-11111111-00000001",
    );
    await page.getByTestId("copy-reference").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Egyházi hozzájárulás");

    const qr = page.getByTestId("giving-qr-code");
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute("role", "img");
    await expect(qr).toHaveAttribute("aria-label", /Szent Tivadar Plébánia/);
    const payload = (await qr.getAttribute("data-payload")) ?? "";
    const fields = payload.split("\n");
    expect(fields).toHaveLength(18); // 17 LF-terminated fields
    expect(fields.slice(0, 5)).toEqual(["HCT", "001", "1", "DEMOHUHB", "Szent Tivadar Plébánia"]);
    expect(fields[5]).toMatch(/^HU\d{2}999999991111111100000001$/);
    expect(fields[7]).toMatch(/^\d{14}[+]\d$/);
    expect(fields[9]).toBe("Egyházi hozzájárulás");
    await expect(page.getByTestId("giving-qr-validity")).toContainText("A kód érvényessége:");

    const szja = page.getByTestId("giving-szja");
    await expect(szja.getByRole("heading", { name: "1%-os felajánlás" })).toBeVisible();
    await expect(page.getByTestId("giving-technical-number")).toHaveText("DEMO-0001");
    await expect(page.getByTestId("giving-foundation-tax")).toHaveText("19999999-1-13");

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /^http:\/\/localhost:\d+\/tamogatas$/,
    );
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  for (const church of ["reformed", "baptist"] as const) {
    test(`works for the ${church} demo church`, async ({ page }) => {
      await openAs(page, church, "/tamogatas");
      const e = EXPECTED[church];
      await expect(page.getByRole("heading", { level: 1, name: "Támogatás" })).toBeVisible();
      await expect(page.getByTestId("giving-account")).toHaveText(e.account);
      await expect(page.getByTestId("giving-reference")).toHaveText(e.reference);
      await expect(page.getByTestId("giving-technical-number")).toHaveText(e.technicalNumber);
      await expect(page.getByTestId("giving-foundation-tax")).toHaveCount(0);
      await expect(page.getByTestId("giving-qr-code")).toBeVisible();
      expect(await axeSeriousOrCritical(page)).toEqual([]);
    });
  }

  test("the internal route is not a second public URL", async ({ page }) => {
    const response = await page.goto("/term/giving");
    expect(response?.status()).toBe(404);
  });

  test("printing hides the copy buttons and the footer", async ({ page }) => {
    await page.goto("/tamogatas");
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("giving-account")).toBeVisible();
    await expect(page.getByTestId("copy-account")).toBeHidden();
    await expect(page.getByTestId("site-footer")).toBeHidden();
  });
});

test.describe("site footer", () => {
  for (const church of ["catholic", "reformed", "baptist"] as const) {
    test(`shows contact, office hours, legal links and social icons (${church})`, async ({
      page,
    }) => {
      const e = EXPECTED[church];
      await openAs(page, church, "/kapcsolat");
      const footer = page.getByRole("contentinfo");
      await expect(footer).toBeVisible();
      await expect(footer).toContainText(CHURCHES[church]);
      await expect(footer.getByTestId("footer-contact")).toContainText(e.address);
      await expect(footer.getByTestId("footer-contact").locator('a[href^="tel:+36"]')).toHaveCount(
        1,
      );
      await expect(footer.getByTestId("footer-contact").locator('a[href^="mailto:"]')).toHaveCount(
        1,
      );
      await expect(footer.getByTestId("footer-hours-row")).toHaveCount(e.hoursRows);
      await expect(footer.getByTestId("footer-hours-row").first()).toHaveText(
        /^(Hétfő|Kedd|Szerda|Csütörtök|Péntek)(–\S+)?: \d{1,2}:\d{2}–\d{1,2}:\d{2}/,
      );

      const legal = footer.getByRole("navigation", { name: "Jogi tájékoztatók" });
      await expect(legal.getByRole("link", { name: "Impresszum" })).toHaveAttribute(
        "href",
        "/impresszum",
      );
      await expect(legal.getByRole("link", { name: "Adatkezelési tájékoztató" })).toHaveAttribute(
        "href",
        "/adatkezeles",
      );
      await expect(footer.getByRole("link", { name: "Támogatás" })).toHaveAttribute(
        "href",
        "/tamogatas",
      );

      const social = footer.getByTestId("footer-social").getByRole("link");
      await expect(social).toHaveCount(e.social.length);
      for (const [i, network] of e.social.entries()) {
        const link = social.nth(i);
        await expect(link).toHaveAttribute("data-network", network);
        await expect(link).toHaveAttribute("href", /^https:\/\//);
        await expect(link).toHaveAttribute("rel", /noopener/);
        // Inline SVG only: no image or script of a third party.
        await expect(link.locator("svg")).toHaveCount(1);
        await expect(link.locator("img")).toHaveCount(0);
      }

      // Every public page has the footer.
      for (const path of [
        e.schedulePath,
        "/hirdetesek",
        "/esemenyek",
        "/hirek",
        "/templomaink",
        "/tamogatas",
        "/impresszum",
      ]) {
        await page.goto(path);
        await expect(page.getByRole("contentinfo"), path).toContainText(CHURCHES[church]);
        await expect(banner(page), path).toBeVisible();
      }
      expect(await axeSeriousOrCritical(page, "footer")).toEqual([]);
    });
  }
});

test.describe("legal pages", () => {
  for (const [path, title] of [
    ["/impresszum", "Impresszum"],
    ["/adatkezeles", "Adatkezelési tájékoztató"],
  ] as const) {
    test(`${path} is a placeholder until the generated text arrives`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByTestId("legal-placeholder")).toContainText(
        "A szöveg hamarosan elérhető lesz.",
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${path}$`),
      );
      expect(await axeSeriousOrCritical(page)).toEqual([]);
    });
  }
});

test.describe("SEO", () => {
  test("sitemap.xml lists the church's public URLs and sets no cookie", async ({ page }) => {
    await page.goto("/kapcsolat");
    const response = await page.request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/xml");
    expect(response.headers()["set-cookie"]).toBeUndefined();
    const xml = await response.text();
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => new URL(m[1]!.replace(/&amp;/g, "&")).pathname,
    );
    for (const path of [
      "/",
      "/miserend",
      "/hirdetesek",
      "/esemenyek",
      "/esemenyek/hittanora",
      "/hirek",
      "/hirek/adventi-lelkinap",
      "/templomaink",
      "/templomaink/szent-tivadar-templom",
      "/tamogatas",
      "/kapcsolat",
      "/impresszum",
      "/adatkezeles",
    ]) {
      expect(locs, path).toContain(path);
    }
    expect(locs.some((p) => p === "/hirdetesek")).toBe(true);
    expect(xml).toMatch(/hirdetesek\?het=\d{4}-\d{2}-\d{2}/);
    // Every listed URL answers 200 (a sample of the detail pages).
    for (const path of ["/esemenyek/hittanora", "/hirek/adventi-lelkinap", "/tamogatas"]) {
      expect((await page.request.get(path)).status(), path).toBe(200);
    }
  });

  test("sitemap.xml follows the church's context and terminology", async ({ page }) => {
    await openAs(page, "reformed", "/kapcsolat");
    const xml = await (await page.request.get("/sitemap.xml")).text();
    expect(xml).toContain("/istentiszteleti-rend</loc>");
    expect(xml).not.toContain("/miserend</loc>");
    expect(xml).not.toContain("szent-tivadar-templom");
  });

  test("robots.txt disallows everything in the demo and sets no cookie", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(response.headers()["set-cookie"]).toBeUndefined();
    expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
  });

  test("without demo mode robots.txt allows crawling and points to the sitemap", async ({
    request,
  }) => {
    const response = await request.get(`${NO_DEMO}/robots.txt`);
    expect(response.headers()["set-cookie"]).toBeUndefined();
    const text = await response.text();
    expect(text).toContain("User-agent: *\nAllow: /\n");
    expect(text).toContain("Disallow: /admin");
    expect(text).toMatch(/Sitemap: http:\/\/localhost:\d+\/sitemap\.xml/);
    const sitemap = await request.get(`${NO_DEMO}/sitemap.xml`);
    expect(sitemap.status()).toBe(200);
    expect(sitemap.headers()["set-cookie"]).toBeUndefined();
  });

  test("pages declare lang=hu, a canonical URL, and the demo is noindex", async ({ page }) => {
    for (const [path, canonical] of [
      ["/kapcsolat", "/kapcsolat"],
      ["/templomaink", "/templomaink"],
      ["/templomaink/szent-tivadar-templom", "/templomaink/szent-tivadar-templom"],
      ["/esemenyek", "/esemenyek"],
      ["/esemenyek/hittanora", "/esemenyek/hittanora"],
      ["/hirek", "/hirek"],
      ["/miserend", "/miserend"],
      ["/hirdetesek", "/hirdetesek"],
      ["/tamogatas", "/tamogatas"],
    ] as const) {
      await page.goto(path);
      await expect(page.locator("html"), path).toHaveAttribute("lang", "hu");
      const href = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(href, path).not.toBeNull();
      expect(new URL(href!).pathname, path).toBe(canonical);
      await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", /noindex/);
    }
  });

  for (const church of ["catholic", "reformed"] as const) {
    test(`the church's structured data is valid (${church})`, async ({ page }) => {
      await openAs(page, church, "/kapcsolat");
      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
      const data = blocks
        .map((b) => JSON.parse(b) as Record<string, unknown>)
        .find((d) => d["@id"]?.toString().endsWith("/#church"));
      expect(data).toBeDefined();
      expect(data).toMatchObject({
        "@context": "https://schema.org",
        "@type": EXPECTED[church].jsonLdType,
        name: CHURCHES[church],
        address: { "@type": "PostalAddress", addressCountry: "HU", postalCode: "2999" },
        telephone: expect.stringMatching(/^\+36\d{8,9}$/),
        geo: { "@type": "GeoCoordinates" },
      });
      expect(Array.isArray(data!.containsPlace)).toBe(true);
    });
  }
});
