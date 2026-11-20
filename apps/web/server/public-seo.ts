import { getTerms } from "@/i18n/terms";
import { demoModeEnabled } from "@/lib/demo/flag";
import { eventPath } from "@/lib/events/public-event";
import { canonicalPagePath } from "@/lib/pages/public-pages";
import { churchJsonLd, sitemapEntries, type SitemapEntry } from "@/lib/seo";
import { getPublicAnnouncementSite } from "@/server/public-announcements";
import {
  aheadWindow,
  getPublicLocations,
  publicOccurrences,
  requestOrigin,
} from "@/server/public-events";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Data of the SEO routes and the church's structured data (D-17). Everything is read through the
 * repository interfaces with the anonymous tenant ctx of the request's church, so only what a
 * visitor may see is ever listed.
 */

/** The request's church, its anonymous ctx and effective config (memoized per request). */
export const getPublicSite = getPublicAnnouncementSite;

/** Whether search engines may index this deployment: never the demo (D-92 AC3). */
export function siteIndexable(): boolean {
  return !demoModeEnabled();
}

/** Upper bound of rows read per list for the sitemap (far above a parish's content). */
const MAX_PAGES = 50;
const PAGE_SIZE = 200;

async function allPages<T>(
  read: (page: number) => Promise<{ items: T[]; total: number; pageSize: number }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await read(page);
    rows.push(...result.items);
    if (page * result.pageSize >= result.total || result.items.length === 0) break;
  }
  return rows;
}

/** Every public URL of the request's church (`/sitemap.xml`). */
export async function getSitemapEntries(now = new Date()): Promise<SitemapEntry[]> {
  const [site, repos, terms, origin] = await Promise.all([
    getPublicSite(),
    getRequestRepositories(),
    getTerms(),
    requestOrigin(),
  ]);
  if (site === null) return [];
  const { ctx, config } = site;
  const on = (m: keyof typeof config.modules) => config.modules[m] === true;
  const read = <T>(enabled: boolean, load: () => Promise<T[]>) =>
    enabled ? load() : Promise.resolve([] as T[]);

  const [posts, events, locations, announcements, pages] = await Promise.all([
    read(on("news"), () =>
      allPages((page) => repos.news.listPublished(ctx, { page, pageSize: PAGE_SIZE })),
    ),
    read(on("events"), () => repos.events.listPublic(ctx, aheadWindow(now))),
    read(on("locations"), () => repos.locations.list(ctx)),
    read(on("announcements"), () =>
      allPages((page) => repos.announcements.list(ctx, { page, pageSize: PAGE_SIZE })),
    ),
    repos.pages.listPublished(ctx),
  ]);
  const pagePaths = pages.flatMap((p) => canonicalPagePath(p, pages, terms) ?? []);
  return sitemapEntries({
    origin,
    terms,
    modules: config.modules,
    posts,
    events,
    locations,
    announcements,
    pagePaths,
  });
}

/** How many upcoming events the church's structured data lists. */
const JSON_LD_EVENTS = 5;

/**
 * schema.org `CatholicChurch` / `Church` of the request's church (SDD §15), ready for the home
 * page; null without a church. Mount it with `jsonLdScript()` in a
 * `<script type="application/ld+json">`.
 */
export async function getChurchJsonLd(now = new Date()): Promise<Record<string, unknown> | null> {
  const [site, origin, locations] = await Promise.all([
    getPublicSite(),
    requestOrigin(),
    getPublicLocations(),
  ]);
  if (site === null) return null;
  const { tenant, config } = site;
  const occurrences = config.modules.events
    ? (await publicOccurrences(aheadWindow(now))).filter((o) => o.endMs > now.getTime())
    : [];
  return churchJsonLd({
    denomination: tenant.denomination,
    name: tenant.name,
    origin,
    description: config.identity.tagline ?? null,
    contact: config.contact,
    integrations: config.integrations,
    locations: [...locations.values()],
    events: occurrences.slice(0, JSON_LD_EVENTS).map((o) => {
      const place = o.event.locationId ? locations.get(o.event.locationId) : undefined;
      return {
        name: o.event.title,
        startDate: o.allDay ? o.date : o.start,
        endDate: o.allDay ? o.lastDate : o.end,
        url: `${origin}${eventPath(o.event)}`,
        ...(place ? { placeName: place.name } : {}),
      };
    }),
  });
}
