import { expect, test, type Page } from "@playwright/test";
import { CHURCHES, axeSeriousOrCritical, switchContext } from "./demo-helpers";

/**
 * D-16 [UI]: static pages built from page blocks, the staff page and the preset rite pages, on the
 * three demo churches. Every test has its own demo session and starts in the Catholic parish.
 */

/** The header's main navigation; opens the mobile disclosure menu first when needed. */
async function mainNav(page: Page) {
  const toggle = page.getByRole("button", { name: "Menü megnyitása" });
  if (await toggle.isVisible()) await toggle.click();
  return page.getByRole("navigation", { name: "Főmenü" });
}

const RITES = [
  {
    church: CHURCHES.catholic,
    section: "Szentségek",
    path: "/szentsegek",
    rites: ["Keresztelő", "Elsőáldozás", "Bérmálás", "Házasság", "Temetés", "Betegek kenete"],
    sample: { key: "keresztelo", title: "Keresztelő", cta: "Bejelentés indítása" },
    absent: "/szentsegek/konfirmacio",
  },
  {
    church: CHURCHES.reformed,
    section: "Alkalmak",
    path: "/alkalmak",
    rites: ["Keresztelő", "Konfirmáció", "Házasságkötés", "Temetés"],
    sample: { key: "konfirmacio", title: "Konfirmáció", cta: null },
    absent: "/alkalmak/bermalas",
  },
  {
    church: CHURCHES.baptist,
    section: "Életesemények",
    path: "/eletesemenyek",
    rites: ["Bemerítés", "Házasságkötés", "Temetés", "Gyermekbemutatás"],
    sample: { key: "bemerites", title: "Bemerítés", cta: null },
    absent: "/eletesemenyek/keresztelo",
  },
] as const;

test.describe("rite pages per preset", () => {
  for (const expected of RITES) {
    test(`${expected.church}: ${expected.rites.length} rites`, async ({ page }) => {
      await page.goto("/");
      if (expected.church !== CHURCHES.catholic) await switchContext(page, expected.church);

      const nav = await mainNav(page);
      await expect(nav.getByRole("link", { name: expected.section, exact: true })).toHaveAttribute(
        "href",
        expected.path,
      );

      expect((await page.goto(expected.path))?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(expected.section);
      const cards = page.getByTestId("rites-list").getByRole("listitem");
      await expect(cards).toHaveCount(expected.rites.length);
      await expect(page.getByTestId("rites-list").getByRole("heading", { level: 3 })).toHaveText([
        ...expected.rites,
      ]);
      expect(await axeSeriousOrCritical(page)).toEqual([]);

      // A rite page: preset title, editable content from the church, link to the request form.
      const ritePath = `${expected.path}/${expected.sample.key}`;
      await page.getByRole("link", { name: expected.sample.title, exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`${ritePath}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(expected.sample.title);
      const rite = page.getByTestId("rite-page");
      await expect(rite.getByRole("heading", { name: "Szükséges dokumentumok" })).toBeVisible();
      const request = rite.locator(`a[href="${ritePath}/bejelentes"]`);
      await expect(request).toHaveCount(1);
      if (expected.sample.cta) await expect(request).toHaveText(expected.sample.cta);
      await expect(rite.getByRole("heading", { name: "Kapcsolat" })).toBeVisible();
      expect(await axeSeriousOrCritical(page)).toEqual([]);

      // The request form (D-28, covered in requests.spec.ts) opens from the button.
      await request.click();
      await expect(page).toHaveURL(new RegExp(`${ritePath}/bejelentes$`));
      await expect(page.getByTestId("request-form")).toBeVisible();
      expect(await axeSeriousOrCritical(page)).toEqual([]);

      // Rites of other presets and the internal route do not exist here.
      expect((await page.goto(expected.absent))?.status()).toBe(404);
      expect((await page.goto(`/term/rites/${expected.sample.key}`))?.status()).toBe(404);
    });
  }

  test("rite and rites intro pages redirect from their static slug", async ({ page }) => {
    await page.goto("/keresztelo");
    await expect(page).toHaveURL(/\/szentsegek\/keresztelo$/);
    await page.goto("/szertartasok");
    await expect(page).toHaveURL(/\/szentsegek$/);
  });
});

const STAFF = [
  {
    church: CHURCHES.catholic,
    council: "Képviselő-testület",
    first: "dr. Kelemen Ambrus",
    email: "kelemen.ambrus@pelda.hu",
  },
  {
    church: CHURCHES.reformed,
    council: "Presbitérium",
    first: "Fazekas Bálint",
    email: "fazekas.balint@pelda.hu",
  },
  {
    church: CHURCHES.baptist,
    council: "Gyülekezetvezetés",
    first: "Illés Zoltán",
    email: "illes.zoltan@pelda.hu",
  },
] as const;

test.describe("staff page", () => {
  for (const expected of STAFF) {
    test(`${expected.church}: groups, name order, obfuscated emails, tel links`, async ({
      page,
    }) => {
      await page.goto("/");
      if (expected.church !== CHURCHES.catholic) await switchContext(page, expected.church);

      // Grouped under *Rólunk ▾* in the main navigation.
      const nav = await mainNav(page);
      await nav.getByRole("button", { name: "Rólunk" }).click();
      await expect(nav.getByRole("link", { name: "Munkatársaink" })).toHaveAttribute(
        "href",
        "/munkatarsaink",
      );

      // Server HTML: no plain address and no mailto link of any person.
      const raw = await (await page.request.get("/munkatarsaink")).text();
      expect(raw).not.toContain(expected.email);
      expect(raw).not.toMatch(/[a-z0-9.]+@pelda\.hu/);
      expect(raw).not.toContain("mailto:");
      expect(raw).toContain(`${expected.email.split("@")[0]} [kukac] pelda [pont] hu`);

      await page.goto("/munkatarsaink");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Munkatársaink");
      const headings = page.getByRole("main").getByRole("heading", { level: 2 });
      await expect(headings).toHaveText([
        "Lelkipásztori szolgálat",
        "Munkatársak",
        expected.council,
      ]);
      const clergy = page.getByTestId("staff-group-clergy");
      await expect(clergy.getByTestId("staff-name").first()).toHaveText(expected.first);

      // After hydration the first email is a mailto link; phones are tel: links.
      const firstPerson = clergy.getByTestId("staff-person").first();
      await expect(firstPerson.getByRole("link", { name: expected.email })).toHaveAttribute(
        "href",
        `mailto:${expected.email}`,
      );
      const phone = firstPerson.getByTestId("staff-phone");
      await expect(phone).toHaveAttribute("href", /^tel:\+36\d{9}$/);
      await expect(phone).toHaveText(/^\+36 \d{2} \d{3} \d{4}$/);
      // Only contact fields marked public are shown (the second priest's phone is not).
      await expect(
        clergy.getByTestId("staff-person").nth(1).getByTestId("staff-phone"),
      ).toHaveCount(0);
      expect(await axeSeriousOrCritical(page)).toEqual([]);
    });
  }
});

test.describe("static pages and blocks", () => {
  test("renders all eight block types; drops the disallowed embed", async ({ page }) => {
    const foreign: string[] = [];
    page.on("request", (request) => {
      const { hostname, protocol } = new URL(request.url());
      if (protocol !== "data:" && protocol !== "blob:" && hostname !== "localhost") {
        foreign.push(request.url());
      }
    });
    await page.route(/youtube-nocookie\.com/, (route) => route.abort());

    const response = await page.goto("/templomunk");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Templomunk");
    const page_ = page.getByTestId("static-page");
    const types = await page_
      .locator("[data-block]")
      .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute("data-block")))].sort());
    expect(types).toEqual(["cta", "embed", "file", "gallery", "heading", "image", "quote", "text"]);
    // The seed has a YouTube and a Facebook embed; only the allow-listed one is rendered.
    await expect(page_.locator('[data-block="embed"]')).toHaveCount(1);
    await expect(page_.locator('[data-block="embed"]')).toHaveAttribute("data-provider", "youtube");
    await expect(page_.getByRole("list", { name: "Képgaléria" }).getByRole("img")).toHaveCount(4);
    await expect(page_.getByRole("link", { name: /építéstörténete/ })).toHaveAttribute(
      "href",
      "/demo/minta-dokumentum.pdf",
    );
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    // Click-to-load: no third-party request before the click, the nocookie player after it.
    expect(foreign).toEqual([]);
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.getByRole("button", { name: "Videó betöltése" }).click();
    await expect(page.locator("iframe")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
    );
  });

  test("static pages work on every demo church and are listed under Rólunk", async ({ page }) => {
    for (const [church, slug, title] of [
      [CHURCHES.catholic, "tortenetunk", "Történetünk"],
      [CHURCHES.reformed, "templomunk", "Templomunk"],
      [CHURCHES.baptist, "imahazunk", "Imaházunk"],
    ] as const) {
      await page.goto("/");
      if (church !== CHURCHES.catholic) await switchContext(page, church);
      const nav = await mainNav(page);
      await nav.getByRole("button", { name: "Rólunk" }).click();
      await nav.getByRole("link", { name: title }).click();
      await expect(page).toHaveURL(new RegExp(`/${slug}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.getByTestId("static-page").locator("[data-block]").first()).toBeVisible();
    }
  });

  test("reserved and unknown slugs are not static pages", async ({ page }) => {
    // Fixed routes and term slugs keep their own pages.
    await page.goto("/hirek");
    await expect(page.getByTestId("static-page")).toHaveCount(0);
    await page.goto("/miserend");
    await expect(page.getByTestId("static-page")).toHaveCount(0);
    for (const path of ["/nincs-ilyen-oldal", "/term", "/term/staff"]) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
  });
});
