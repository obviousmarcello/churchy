import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHOWCASE = "/fejlesztes/komponensek";

async function axeSeriousOrCritical(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

const bgOf = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe("component showcase", () => {
  test("has landmarks and a working skip link", async ({ page }) => {
    await page.goto(SHOWCASE);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Komponenstár" })).toBeVisible();

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Ugrás a tartalomra" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });

  for (const width of [360, 768, 1024, 1440]) {
    test(`does not scroll horizontally at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(SHOWCASE);
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("keyboard focus is visible", async ({ page }) => {
    await page.goto(SHOWCASE);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement!);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test("axe: 0 serious/critical violations", async ({ page }) => {
    await page.goto(SHOWCASE);
    await page.evaluate(() => document.fonts.ready);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("axe: 0 serious/critical violations with a dialog open", async ({ page }) => {
    await page.goto(SHOWCASE);
    await page.getByRole("button", { name: "Törlés megerősítése" }).click();
    await expect(page.getByRole("dialog", { name: "Biztosan törli?" })).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("axe: 0 serious/critical violations on the home page", async ({ page }) => {
    await page.goto("/");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("the header adapts: disclosure menu on small screens, plain nav on large ones", async ({
    page,
  }, testInfo) => {
    await page.goto(SHOWCASE);
    const header = page.getByTestId("showcase-header");
    const toggle = header.getByRole("button", { name: /^Menü (megnyitása|bezárása)$/ });
    const nav = header.getByRole("navigation", { name: "Főmenü" });
    if (testInfo.project.name === "mobile") {
      await expect(nav).toBeHidden();
      await toggle.click();
      await expect(toggle).toHaveAccessibleName("Menü bezárása");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(nav.getByRole("link", { name: "Miserend" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(nav).toBeHidden();
      await expect(toggle).toBeFocused();
    } else {
      await expect(toggle).toBeHidden();
      await expect(nav.getByRole("link", { name: "Miserend" })).toBeVisible();
      const about = nav.getByRole("button", { name: "Rólunk" });
      await about.click();
      await expect(nav.getByRole("link", { name: "Munkatársaink" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(nav.getByRole("link", { name: "Munkatársaink" })).toBeHidden();
      await expect(about).toBeFocused();
    }
  });
});

test.describe("fonts", () => {
  test("Hungarian double-acute letters render in the theme fonts (latin-ext)", async ({ page }) => {
    await page.goto(SHOWCASE);
    await page.evaluate(() => document.fonts.ready);

    const info = await page.evaluate(async () => {
      const sample = "őŐűŰ";
      const heading = document.querySelector('[data-testid="font-heading-sample"]')!;
      const body = document.querySelector('[data-testid="font-body-sample"]')!;
      const headingFamily = getComputedStyle(heading).fontFamily;
      const bodyFamily = getComputedStyle(body).fontFamily;
      await document.fonts.load('600 24px "Cormorant Garamond"', sample);
      await document.fonts.load('400 17px "Source Sans 3"', sample);

      const loaded = [...document.fonts]
        .filter((f) => f.status === "loaded")
        .map((f) => ({ family: f.family.replaceAll('"', ""), range: f.unicodeRange }));
      const latinExt = (family: string) =>
        loaded.some((f) => f.family === family && /U\+0?100-/i.test(f.range));

      // A face that lacks the glyphs falls back, so the width differs from the pure fallback.
      const ctx = document.createElement("canvas").getContext("2d")!;
      const width = (font: string) => {
        ctx.font = font;
        return ctx.measureText(sample).width;
      };
      return {
        headingFamily,
        bodyFamily,
        headingText: heading.textContent,
        bodyText: body.textContent,
        checkHeading: document.fonts.check('600 24px "Cormorant Garamond"', sample),
        checkBody: document.fonts.check('400 17px "Source Sans 3"', sample),
        headingLatinExt: latinExt("Cormorant Garamond"),
        bodyLatinExt: latinExt("Source Sans 3"),
        headingUsesFont:
          width('600 40px "Cormorant Garamond", monospace') !== width("600 40px monospace"),
        bodyUsesFont: width('400 40px "Source Sans 3", monospace') !== width("400 40px monospace"),
      };
    });

    expect(info.headingFamily).toContain("Cormorant Garamond");
    expect(info.bodyFamily).toContain("Source Sans 3");
    for (const ch of ["ő", "Ő", "ű", "Ű"]) {
      expect(info.headingText + info.bodyText).toContain(ch);
    }
    expect(info.checkHeading).toBe(true);
    expect(info.checkBody).toBe(true);
    expect(info.headingLatinExt).toBe(true);
    expect(info.bodyLatinExt).toBe(true);
    expect(info.headingUsesFont).toBe(true);
    expect(info.bodyUsesFont).toBe(true);
  });

  test("font files are self-hosted", async ({ page }) => {
    const fontRequests: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "font") fontRequests.push(request.url());
    });
    await page.goto(SHOWCASE);
    await page.evaluate(() => document.fonts.ready);
    expect(fontRequests.length).toBeGreaterThan(0);
    for (const url of fontRequests) expect(new URL(url).origin).toBe(new URL(page.url()).origin);
  });
});

test.describe("runtime theming (no rebuild)", () => {
  const primaryButton = (page: Page) => page.getByTestId("playground-apply");

  test("the default config renders Klasszikus burgundy", async ({ page }) => {
    await page.goto(SHOWCASE);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "klasszikus");
    expect(await bgOf(primaryButton(page))).toBe("rgb(110, 31, 46)");
  });

  test("colours in the config change the appearance on the server render", async ({ page }) => {
    await page.goto(`${SHOWCASE}?primary=%230b3c5d&accent=%23f2c14e&radius=round`);
    expect(await bgOf(primaryButton(page))).toBe("rgb(11, 60, 93)");
    const radius = await primaryButton(page).evaluate(
      (el) => getComputedStyle(el).borderTopLeftRadius,
    );
    expect(radius).toBe("16px");
    const vars = await page.locator("#showcase-scope").evaluate((el) => ({
      primary: el.style.getPropertyValue("--c-primary"),
      accent: el.style.getPropertyValue("--c-accent"),
    }));
    expect(vars).toEqual({ primary: "#0b3c5d", accent: "#f2c14e" });
    // The tokens flow into other components too (header call to action, hero, cards).
    const cta = page.getByTestId("showcase-header").locator('a[href="#tamogatas"]');
    expect(await bgOf(cta)).toBe("rgb(11, 60, 93)");
  });

  test("an invalid colour in the config falls back to the defaults", async ({ page }) => {
    await page.goto(`${SHOWCASE}?primary=red`);
    expect(await bgOf(primaryButton(page))).toBe("rgb(110, 31, 46)");
  });

  test("editing the config on the page re-themes it live", async ({ page }) => {
    await page.goto(SHOWCASE);
    const before = await bgOf(primaryButton(page));
    await page.getByTestId("playground-primary").fill("#005f73");
    await primaryButton(page).click();
    await page.mouse.move(0, 0); // leave the hover state
    await expect.poll(() => bgOf(primaryButton(page))).toBe("rgb(0, 95, 115)");
    expect(before).not.toBe("rgb(0, 95, 115)");
    await expect(page.getByTestId("playground-message")).toContainText("megfelel");
    expect(new URL(page.url()).search).toBe("");
  });

  test("a primary colour below 4.5:1 is flagged with a suggestion", async ({ page }) => {
    await page.goto(SHOWCASE);
    await page.getByTestId("playground-primary").fill("#d9a441");
    await primaryButton(page).click();
    await expect(page.getByTestId("playground-message")).toContainText("Javasolt árnyalat");
  });
});

test.describe("admin variant", () => {
  const SELECTOR = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="tab"]';

  async function smallTargets(scope: Locator) {
    return scope.locator(SELECTOR).evaluateAll((elements) =>
      elements
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((el) => {
          // A checkbox's hit area is its whole label row.
          const target =
            el instanceof HTMLInputElement && el.type === "checkbox"
              ? (el.closest("label") ?? el)
              : el;
          const rect = target.getBoundingClientRect();
          return {
            name: el.textContent?.trim() || el.getAttribute("aria-label") || el.tagName,
            w: rect.width,
            h: rect.height,
          };
        })
        .filter((t) => t.w < 43.99 || t.h < 43.99),
    );
  }

  test("every interactive element is at least 44 x 44 px", async ({ page }) => {
    await page.goto(SHOWCASE);
    const admin = page.getByTestId("showcase-admin");
    expect(await admin.locator(SELECTOR).count()).toBeGreaterThan(10);
    expect(await smallTargets(admin)).toEqual([]);
  });

  test("dialog controls inside the admin scope are at least 44 x 44 px too", async ({ page }) => {
    await page.goto(SHOWCASE);
    const admin = page.getByTestId("showcase-admin");
    await admin.getByRole("button", { name: "Törlés" }).click();
    const dialog = admin.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await smallTargets(dialog)).toEqual([]);
  });

  test("uses the base font size of 17 px and high-contrast sans headings", async ({ page }) => {
    await page.goto(SHOWCASE);
    const admin = page.getByTestId("showcase-admin");
    const info = await admin.evaluate((el) => {
      const label = el.querySelector("label")!;
      return {
        font: getComputedStyle(label).fontSize,
        heading: getComputedStyle(el.querySelector("h3")!).fontFamily,
        bg: getComputedStyle(el).backgroundColor,
      };
    });
    expect(info.font).toBe("17px");
    expect(info.heading).toContain("Source Sans 3");
    expect(info.heading).not.toContain("Cormorant");
    expect(info.bg).toBe("rgb(255, 255, 255)");
  });
});

test.describe("dev-only route", () => {
  test("is not indexable", async ({ page }) => {
    await page.goto(SHOWCASE);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
