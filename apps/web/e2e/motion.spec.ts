import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Design v2 (UI-05): motion tokens, reduced motion, view transitions, animated primitives. */

const SHOWCASE = "/fejlesztes/komponensek";

async function axeSeriousOrCritical(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

/** Waits until every running CSS animation / transition on the page has finished. */
async function settleAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

const staggerAnimations = (page: Page) =>
  page
    .getByTestId("motion-stagger")
    .locator(":scope > li")
    .evaluateAll((items) => items.map((el) => getComputedStyle(el).animationName));

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("lists fade up one after another and buttons get lift and press tokens", async ({
    page,
  }) => {
    await page.goto(SHOWCASE);
    await page.getByTestId("motion-replay").click();
    expect(await staggerAnimations(page)).toEqual(["ui-fade-up", "ui-fade-up", "ui-fade-up"]);
    const delays = await page
      .getByTestId("motion-stagger")
      .locator(":scope > li")
      .evaluateAll((items) => items.map((el) => parseFloat(getComputedStyle(el).animationDelay)));
    expect(delays[1]).toBeGreaterThan(delays[0]!);
    expect(delays[2]).toBeGreaterThan(delays[1]!);
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        lift: cs.getPropertyValue("--motion-lift").trim(),
        press: cs.getPropertyValue("--motion-press").trim(),
      };
    });
    expect(tokens.lift).toBe("-3px");
    expect(parseFloat(tokens.press)).toBeCloseTo(0.97);
    await settleAnimations(page);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("the segmented control's thumb slides to the chosen option", async ({ page }) => {
    await page.goto(SHOWCASE);
    const control = page.getByTestId("showcase-segmented");
    const thumb = control.locator("[data-segmented-thumb]");
    const x = () => thumb.evaluate((el) => el.getBoundingClientRect().left);
    await control.scrollIntoViewIfNeeded();
    await settleAnimations(page);
    const before = await x();
    await control.getByText("Hónap").click();
    await expect(control.getByRole("radio", { name: "Hónap" })).toBeChecked();
    await expect.poll(x).toBeGreaterThan(before);
  });

  test("popover menu, disclosure and drawer open and close", async ({ page }) => {
    await page.goto(SHOWCASE);
    const trigger = page.getByTestId("showcase-primitives").getByRole("button", {
      name: "Műveletek",
      exact: true,
    });
    await trigger.click();
    const menu = page.getByRole("dialog", { name: "Hirdetés műveletei" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "Szerkesztés" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    const disclosure = page.getByTestId("showcase-disclosure");
    await disclosure.locator("summary").click();
    await expect(disclosure).toHaveAttribute("open", "");
    await expect(disclosure.getByText(/négy héttel/)).toBeVisible();

    await page.getByRole("button", { name: "Szűrők megnyitása" }).click();
    const drawer = page.getByRole("dialog", { name: "Szűrők" });
    await expect(drawer).toHaveAttribute("data-placement", "end");
    await settleAnimations(page);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await drawer.getByRole("button", { name: "Mégse" }).click();
    await expect(drawer).toBeHidden();
  });

  test("cross-document page transitions are enabled and the demo bar is anchored", async ({
    page,
  }) => {
    await page.goto(SHOWCASE);
    const enabled = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some((rule) => rule.cssText.includes("@view-transition"));
        } catch {
          return false;
        }
      }),
    );
    expect(enabled).toBe(true);
    expect(
      await page
        .getByTestId("demo-banner")
        .evaluate((el) => getComputedStyle(el).viewTransitionName),
    ).toBe("demo-bar");
    // A plain link still navigates normally (the transition never blocks clicks).
    await page.getByRole("link", { name: "Kezdőlap megnyitása" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("main")).toBeVisible();
  });
});

test.describe("with prefers-reduced-motion: reduce", () => {
  test.use({ reducedMotion: "reduce" });

  test("removes entrance animations, movement and transitions", async ({ page }) => {
    await page.goto(SHOWCASE);
    await page.getByTestId("motion-replay").click();
    expect(await staggerAnimations(page)).toEqual(["none", "none", "none"]);

    const state = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const button = document.querySelector<HTMLElement>('[data-testid="motion-save"]')!;
      const enabled = [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some(
            (rule) =>
              rule instanceof CSSMediaRule &&
              rule.media.mediaText.includes("no-preference") &&
              rule.cssText.includes("@view-transition") &&
              matchMedia(rule.media.mediaText).matches,
          );
        } catch {
          return false;
        }
      });
      return {
        lift: cs.getPropertyValue("--motion-lift").trim(),
        press: cs.getPropertyValue("--motion-press").trim(),
        rise: cs.getPropertyValue("--motion-rise").trim(),
        buttonTransition: parseFloat(getComputedStyle(button).transitionDuration),
        viewTransitionActive: enabled,
      };
    });
    expect(state.lift).toBe("0px");
    expect(state.press).toBe("1");
    expect(state.rise).toBe("0px");
    expect(state.buttonTransition).toBeLessThan(0.001);
    expect(state.viewTransitionActive).toBe(false);

    // Focus ring: no draw-in animation, still a visible outline.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement!);
      return { animation: cs.animationName, outline: parseFloat(cs.outlineWidth) };
    });
    expect(focus.animation).toBe("none");
    expect(focus.outline).toBeGreaterThanOrEqual(2);
  });

  test("dialogs open and close instantly and axe stays at 0 serious/critical", async ({ page }) => {
    await page.goto(SHOWCASE);
    await page.getByRole("button", { name: "Szűrők megnyitása" }).click();
    const drawer = page.getByRole("dialog", { name: "Szűrők" });
    await expect(drawer).toBeVisible();
    const duration = await drawer.evaluate((el) =>
      parseFloat(getComputedStyle(el).animationDuration),
    );
    expect(duration).toBeLessThan(0.001);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("the home page has 0 serious/critical axe violations", async ({ page }) => {
    await page.goto("/");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });
});
