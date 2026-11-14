import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { BANNER_TEXT, banner, switchPersona, type PersonaKey } from "./demo-helpers";

/**
 * D-92 AC2: the banner *„Bemutató — nem valós adatok”* is on 100 % of the routes. The route list is
 * not maintained by hand: it is read from the app directory (every `page.tsx`), so a new page is
 * covered automatically. Dynamic segments need a sample value in `SAMPLE_PARAMS`, otherwise the
 * test fails and asks for one.
 */
const APP_DIR = fileURLToPath(new URL("../app", import.meta.url));

/** Sample values for dynamic segments (`[slug]` → a real demo slug). */
const SAMPLE_PARAMS: Record<string, string> = {};

function pagesIn(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Private folders (`_x`) are not routes.
      if (!entry.name.startsWith("_")) found.push(...pagesIn(path));
    } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
      found.push(dir);
    }
  }
  return found;
}

function routeOf(dir: string): string {
  const segments = relative(APP_DIR, dir)
    .split(sep)
    .filter((s) => s !== "")
    // Route groups `(x)` and parallel-route slots `@x` do not appear in the URL.
    .filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith("@"))
    .map((s) => {
      const dynamic = /^\[{1,2}(?:\.\.\.)?([^\]]+)\]{1,2}$/.exec(s);
      if (!dynamic) return s;
      const sample = SAMPLE_PARAMS[dynamic[1]!];
      if (sample === undefined) throw new Error(`Add a sample value for [${dynamic[1]}] (${dir})`);
      return sample;
    });
  return `/${segments.join("/")}`;
}

const ROUTES = [...pagesIn(APP_DIR).map(routeOf).sort(), "/nem-letezo-oldal"];

/** Personas that see different shells: public visitor, church staff, diocese. */
const AS: PersonaKey[] = ["latogato", "tulajdonos", "egyhazmegyeiHr"];

test("the route list is read from the app directory", () => {
  expect(ROUTES).toEqual(
    expect.arrayContaining([
      "/",
      "/admin",
      "/munkater",
      "/egyhazmegye",
      "/fejlesztes/komponensek",
      "/fejlesztes/kimeno-levelek",
    ]),
  );
});

for (const persona of AS) {
  test(`every route shows the demo banner (${persona})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    await switchPersona(page, persona);
    for (const route of ROUTES) {
      const response = await page.goto(route);
      expect(response, route).not.toBeNull();
      const b = banner(page);
      await expect(b, route).toBeVisible();
      await expect(b, route).toContainText(BANNER_TEXT);
      // At the top of the page, above everything else.
      expect(await b.evaluate((el) => el.getBoundingClientRect().top), route).toBeLessThanOrEqual(
        0,
      );
    }
  });
}
