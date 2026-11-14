import { expect, test, type Page } from "@playwright/test";

const SHOWCASE = "/fejlesztes/komponensek";
const WIDTHS = [360, 768, 1024, 1440] as const;

/** Waits until web fonts and images are ready so screenshots are deterministic. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) => {
        img.loading = "eager"; // lazy images below the fold would never load otherwise
        return img.complete ? undefined : img.decode().catch(() => undefined);
      }),
    );
  });
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test.beforeEach(async ({ page }) => {
      await page.goto(SHOWCASE);
      await settle(page);
    });

    test("header", async ({ page }) => {
      const header = page.getByTestId("showcase-header");
      await header.scrollIntoViewIfNeeded();
      await expect(header).toHaveScreenshot(`header-${width}.png`);
    });

    test("header with open mobile menu", async ({ page }) => {
      test.skip(width >= 1024, "The menu is always visible from 1024 px");
      const wrapper = page.getByTestId("showcase-header");
      await wrapper.getByRole("button", { name: "Menü megnyitása" }).click();
      await wrapper.getByRole("button", { name: "Rólunk" }).click();
      const clip = await page.evaluate(() => {
        const header = document.querySelector('[data-testid="showcase-header"]')!;
        const nav = header.querySelector("nav")!;
        const a = header.getBoundingClientRect();
        const b = nav.getBoundingClientRect();
        const top = Math.min(a.top, b.top) + window.scrollY;
        const bottom = Math.max(a.bottom, b.bottom) + window.scrollY;
        return { x: 0, y: top - 8, width: window.innerWidth, height: bottom - top + 16 };
      });
      await expect(page).toHaveScreenshot(`header-menu-open-${width}.png`, {
        clip,
        fullPage: true,
      });
    });

    for (const variant of ["image-full", "image-split", "text-only"]) {
      test(`hero ${variant}`, async ({ page }) => {
        const hero = page.getByTestId(`showcase-hero-${variant}`).locator("section");
        await hero.scrollIntoViewIfNeeded();
        await expect(hero).toHaveScreenshot(`hero-${variant}-${width}.png`);
      });
    }

    test("cards", async ({ page }) => {
      const cards = page.getByTestId("showcase-cards");
      await cards.scrollIntoViewIfNeeded();
      await expect(cards).toHaveScreenshot(`cards-${width}.png`);
    });

    test("footer", async ({ page }) => {
      const footer = page.getByRole("contentinfo");
      await footer.scrollIntoViewIfNeeded();
      await expect(footer).toHaveScreenshot(`footer-${width}.png`);
    });
  });
}
