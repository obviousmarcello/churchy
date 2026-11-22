import type { Page } from "@playwright/test";

/** Demo sites of the three churches (`/demo/<slug>`, slugs from the seed). */
export const SITE_SLUGS = {
  catholic: "szent-tivadar",
  reformed: "dunaligeti-reformatus",
  baptist: "dunaligeti-baptista",
} as const;

const SLUG_BY_NAME: Record<string, string> = {
  "Szent Tivadar Plébánia": SITE_SLUGS.catholic,
  "Dunaligeti Református Egyházközség": SITE_SLUGS.reformed,
  "Dunaligeti Baptista Gyülekezet": SITE_SLUGS.baptist,
};

/** Opens a church's public demo site, optionally a page of it (`/demo/<slug>/kapcsolat`). */
export async function gotoChurch(
  page: Page,
  church: keyof typeof SITE_SLUGS,
  path = "",
): Promise<void> {
  await page.goto(`/demo/${SITE_SLUGS[church]}${path}`);
}

/**
 * Opens the public home of the church the demo menu currently shows (the old `goto("/")`: the
 * church home is now `/demo/<slug>`); the Catholic parish on a fresh page or in the diocese.
 */
export async function gotoHome(page: Page, path = ""): Promise<void> {
  let slug: string = SITE_SLUGS.catholic;
  if (page.url() !== "about:blank") {
    const name = (await page.getByTestId("demo-current-context").first().textContent())?.trim();
    slug = (name && SLUG_BY_NAME[name]) || slug;
  }
  await page.goto(`/demo/${slug}${path}`);
}

/** A regular expression matching a link that ends with `path` (church links carry `/demo/<slug>`). */
export function endsWith(path: string | RegExp): RegExp {
  if (typeof path !== "string") return path;
  return new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}
