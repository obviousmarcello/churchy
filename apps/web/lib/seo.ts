import type {
  Announcement,
  Denomination,
  Event,
  Location,
  ModuleKey,
  Post,
  SiteConfig,
} from "@churchy/contracts";
import { phoneToE164 } from "@churchy/hu";
import { announcementsHref } from "@/lib/announcements/view";
import { eventPath, locationPath } from "@/lib/events/public-event";
import { LEGAL_PATHS, socialLinks } from "@/lib/footer";
import { LOCATIONS_PATH, locationJsonLd } from "@/lib/locations";
import { NEWS_PATH, newsPath } from "@/lib/news/public-news";
import { termRoutePath, type TermSlugs } from "@/lib/term-routes";

/**
 * SEO basics (NFR-08, SDD §15, D-17): the per-tenant sitemap, robots.txt and the church's
 * structured data. Pure, so they are unit tested; the route handlers and pages only gather data.
 */

/** Public paths that exist for every church (core module, SDD §6). */
export const CONTACT_PATH = "/kapcsolat";
export const EVENTS_PATH = "/esemenyek";
export const EVENTS_CALENDAR_PATH = "/esemenyek/naptar";

export interface SitemapEntry {
  /** Absolute URL. */
  loc: string;
  /** ISO date-time of the last change, when known. */
  lastmod?: string;
}

export interface SitemapSource {
  /** `https://host` of the tenant's public site. */
  origin: string;
  terms: TermSlugs;
  modules: Partial<Record<ModuleKey, boolean>>;
  posts: readonly Pick<Post, "slug" | "updatedAt">[];
  events: readonly Pick<Event, "slug" | "updatedAt">[];
  locations: readonly Pick<Location, "slug" | "updatedAt">[];
  announcements: readonly Pick<Announcement, "weekSunday" | "updatedAt">[];
  /** Canonical paths of the visible static and rite pages (`canonicalPagePath()`, D-16). */
  pagePaths?: readonly string[];
}

/**
 * Every public URL of one church: the home page, its term routes (`/miserend`,
 * `/istentiszteleti-rend` …), the list and detail pages of the enabled modules, contact and the
 * legal pages. Only what the anonymous visitor can open is passed in, so drafts never appear.
 * Duplicates are dropped (an event series lists each slug once).
 */
export function sitemapEntries(source: SitemapSource): SitemapEntry[] {
  const { origin, terms, modules } = source;
  const on = (m: ModuleKey) => modules[m] === true;
  const out: SitemapEntry[] = [];
  const seen = new Set<string>();
  const add = (path: string, lastmod?: string) => {
    const loc = `${origin}${path}`;
    if (seen.has(loc)) return;
    seen.add(loc);
    out.push(lastmod ? { loc, lastmod } : { loc });
  };

  add("/");
  if (on("schedule")) add(termRoutePath(terms, "serviceSchedule"));
  if (on("announcements")) {
    const base = termRoutePath(terms, "announcementsSection");
    add(base);
    for (const a of source.announcements)
      add(announcementsHref(base, { week: a.weekSunday }), a.updatedAt);
  }
  if (on("events")) {
    add(EVENTS_PATH);
    add(EVENTS_CALENDAR_PATH);
    for (const e of source.events) add(eventPath(e), e.updatedAt);
  }
  if (on("news")) {
    add(NEWS_PATH);
    for (const p of source.posts) add(newsPath(p), p.updatedAt);
  }
  if (on("locations")) {
    add(LOCATIONS_PATH);
    for (const l of source.locations) add(locationPath(l), l.updatedAt);
  }
  if (on("staff")) add(termRoutePath(terms, "staffSection"));
  if (on("rites")) add(termRoutePath(terms, "ritesSection"));
  if (on("giving")) add(termRoutePath(terms, "givingSection"));
  // Static and rite pages (D-16), at their canonical paths.
  for (const path of source.pagePaths ?? []) add(path);
  add(CONTACT_PATH);
  add(LEGAL_PATHS.impresszum);
  add(LEGAL_PATHS.privacy);
  return out;
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const xml = (text: string) => text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!);

/** sitemaps.org 0.9 `urlset` document. */
export function sitemapXml(entries: readonly SitemapEntry[]): string {
  const urls = entries.map(
    (e) =>
      `  <url>\n    <loc>${xml(e.loc)}</loc>\n` +
      (e.lastmod ? `    <lastmod>${xml(e.lastmod)}</lastmod>\n` : "") +
      `  </url>\n`,
  );
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("")}</urlset>\n`
  );
}

/**
 * robots.txt: an indexable site allows everything except the app areas and points to its
 * sitemap; the demo deployment (D-92) disallows everything.
 */
export function robotsTxt({ origin, indexable }: { origin: string; indexable: boolean }): string {
  if (!indexable) return "User-agent: *\nDisallow: /\n";
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /munkater",
    "Disallow: /egyhazmegye",
    "Disallow: /fejlesztes",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

/** Headers of the SEO text routes: cacheable (SDD §15) and never a cookie. */
export function seoHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    "X-Content-Type-Options": "nosniff",
  };
}

/**
 * schema.org type of a church by denomination: `CatholicChurch` for the Roman and Greek Catholic
 * presets, `Church` for the other Christian denominations (SDD §15).
 */
export function churchSchemaType(denomination: Denomination): "CatholicChurch" | "Church" {
  return denomination === "rk" || denomination === "gk" ? "CatholicChurch" : "Church";
}

export interface ChurchJsonLdInput {
  denomination: Denomination;
  name: string;
  /** `https://host` of the public site. */
  origin: string;
  description?: string | null;
  contact: Partial<SiteConfig["contact"]>;
  integrations: Partial<SiteConfig["integrations"]>;
  locations: readonly Location[];
  /** Upcoming public events (already expanded), at most a handful. */
  events?: readonly {
    name: string;
    startDate: string;
    endDate?: string;
    url: string;
    /** Name of the place; the church's name when the event has no location. */
    placeName?: string;
  }[];
}

/**
 * The church's structured data (SDD §15) for the home page: `CatholicChurch` / `Church` with
 * address, contact, the first located place's coordinates, each location as a contained place
 * with its opening hours, the social profiles (`sameAs`) and upcoming events.
 */
export function churchJsonLd(input: ChurchJsonLdInput): Record<string, unknown> {
  const { contact, origin } = input;
  const url = `${origin}/`;
  const geo = input.locations.find((l) => l.geo !== null)?.geo ?? null;
  const telephone = contact.phone ? phoneToE164(contact.phone) : null;
  const sameAs = socialLinks(input.integrations).map((s) => s.href);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": churchSchemaType(input.denomination),
    "@id": `${url}#church`,
    name: input.name,
    url,
  };
  if (input.description) data.description = input.description;
  if (contact.address) {
    data.address = {
      "@type": "PostalAddress",
      streetAddress: [contact.address.line1, contact.address.line2].filter(Boolean).join(", "),
      postalCode: contact.address.postalCode,
      addressLocality: contact.address.city,
      addressCountry: "HU",
    };
  }
  if (geo) data.geo = { "@type": "GeoCoordinates", latitude: geo.lat, longitude: geo.lng };
  if (telephone) data.telephone = telephone;
  if (contact.email) data.email = contact.email;
  if (sameAs.length > 0) data.sameAs = sameAs;
  if (input.locations.length > 0) {
    data.containsPlace = input.locations.map((l) => {
      const { "@context": _context, ...place } = locationJsonLd(l, `${origin}${locationPath(l)}`);
      return place;
    });
  }
  if (input.events && input.events.length > 0) {
    data.event = input.events.map((e) => ({
      "@type": "Event",
      name: e.name,
      startDate: e.startDate,
      ...(e.endDate ? { endDate: e.endDate } : {}),
      url: e.url,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      location: { "@type": "Place", name: e.placeName ?? input.name },
    }));
  }
  // Churches are open to everyone (schema.org `Place.isAccessibleForFree`).
  data.isAccessibleForFree = true;
  return data;
}
