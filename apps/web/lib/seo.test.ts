import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Location } from "@churchy/contracts";
import { termsForDenomination } from "@/i18n/terms";
import {
  churchJsonLd,
  churchSchemaType,
  robotsTxt,
  seoHeaders,
  sitemapEntries,
  sitemapXml,
  type SitemapSource,
} from "./seo";

const ORIGIN = "https://minta.churchy.hu";
const STAMP = "2026-11-01T08:00:00.000Z";

const ALL_ON = {
  schedule: true,
  announcements: true,
  events: true,
  news: true,
  locations: true,
  giving: true,
};

function source(overrides: Partial<SitemapSource> = {}): SitemapSource {
  return {
    origin: ORIGIN,
    terms: termsForDenomination("rk"),
    modules: ALL_ON,
    posts: [{ slug: "adventi-lelkinap", updatedAt: STAMP }],
    events: [
      { slug: "hittanora", updatedAt: STAMP },
      // An override child of the same series shares nothing but must not duplicate a slug.
      { slug: "hittanora", updatedAt: STAMP },
    ],
    locations: [{ slug: "szent-anna-kapolna", updatedAt: STAMP }],
    announcements: [{ weekSunday: "2026-11-15", updatedAt: STAMP }],
    ...overrides,
  };
}

describe("sitemapEntries", () => {
  it("lists the home page, term routes, module pages, details, contact and legal pages", () => {
    expect(sitemapEntries(source()).map((e) => e.loc.slice(ORIGIN.length))).toEqual([
      "/",
      "/miserend",
      "/hirdetesek",
      "/hirdetesek?het=2026-11-15",
      "/esemenyek",
      "/esemenyek/naptar",
      "/esemenyek/hittanora",
      "/hirek",
      "/hirek/adventi-lelkinap",
      "/templomaink",
      "/templomaink/szent-anna-kapolna",
      "/tamogatas",
      "/kapcsolat",
      "/impresszum",
      "/adatkezeles",
    ]);
  });

  it("uses the denomination's term slugs and the last change of detail pages", () => {
    const entries = sitemapEntries(source({ terms: termsForDenomination("ref") }));
    expect(entries.map((e) => e.loc)).toContain(`${ORIGIN}/istentiszteleti-rend`);
    expect(entries.map((e) => e.loc)).not.toContain(`${ORIGIN}/miserend`);
    expect(entries.find((e) => e.loc.endsWith("/hirek/adventi-lelkinap"))?.lastmod).toBe(STAMP);
    expect(entries[0]).toEqual({ loc: `${ORIGIN}/` });
  });

  it("adds the staff and rites sections and the static pages (D-16)", () => {
    const paths = sitemapEntries(
      source({
        modules: { staff: true, rites: true },
        pagePaths: ["/rolunk", "/szentsegek/keresztelo"],
      }),
    ).map((e) => e.loc.slice(ORIGIN.length));
    expect(paths).toEqual([
      "/",
      "/munkatarsaink",
      "/szentsegek",
      "/rolunk",
      "/szentsegek/keresztelo",
      "/kapcsolat",
      "/impresszum",
      "/adatkezeles",
    ]);
  });

  it("leaves out the pages of disabled modules", () => {
    const paths = sitemapEntries(source({ modules: { news: true } })).map((e) =>
      e.loc.slice(ORIGIN.length),
    );
    expect(paths).toEqual([
      "/",
      "/hirek",
      "/hirek/adventi-lelkinap",
      "/kapcsolat",
      "/impresszum",
      "/adatkezeles",
    ]);
  });
});

describe("sitemapXml", () => {
  it("writes a sitemaps.org urlset with escaped URLs", () => {
    const xml = sitemapXml([{ loc: `${ORIGIN}/` }, { loc: `${ORIGIN}/a?x=1&y=2`, lastmod: STAMP }]);
    expect(xml).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `  <url>\n    <loc>${ORIGIN}/</loc>\n  </url>\n` +
        `  <url>\n    <loc>${ORIGIN}/a?x=1&amp;y=2</loc>\n    <lastmod>${STAMP}</lastmod>\n  </url>\n` +
        `</urlset>\n`,
    );
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect([...doc.querySelectorAll("loc")].map((n) => n.textContent)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/a?x=1&y=2`,
    ]);
  });
});

describe("robotsTxt", () => {
  it("allows the public site, hides the app areas and points to the sitemap", () => {
    const txt = robotsTxt({ origin: ORIGIN, indexable: true });
    expect(txt).toContain("User-agent: *\nAllow: /\n");
    expect(txt).toContain("Disallow: /admin\n");
    expect(txt).toContain(`Sitemap: ${ORIGIN}/sitemap.xml\n`);
  });

  it("disallows everything when the site must not be indexed (demo)", () => {
    expect(robotsTxt({ origin: ORIGIN, indexable: false })).toBe("User-agent: *\nDisallow: /\n");
  });

  it("sends cacheable text without cookies", () => {
    expect(seoHeaders("text/plain")).toEqual({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    });
  });
});

/**
 * The schema.org shape the church's structured data must have (Google's structured-data
 * guidelines for a local place: name, url, a full `PostalAddress`, E.164 telephone, numeric geo).
 */
const PostalAddress = z.object({
  "@type": z.literal("PostalAddress"),
  streetAddress: z.string().min(1),
  postalCode: z.string().regex(/^\d{4}$/),
  addressLocality: z.string().min(1),
  addressCountry: z.literal("HU"),
});
const ChurchJsonLd = z.object({
  "@context": z.literal("https://schema.org"),
  "@type": z.enum(["CatholicChurch", "Church"]),
  "@id": z.url(),
  name: z.string().min(1),
  url: z.url(),
  address: PostalAddress,
  geo: z.object({
    "@type": z.literal("GeoCoordinates"),
    latitude: z.number(),
    longitude: z.number(),
  }),
  telephone: z.string().regex(/^\+36\d{8,9}$/),
  email: z.email(),
  sameAs: z.array(z.url()).optional(),
  isAccessibleForFree: z.literal(true),
  containsPlace: z
    .array(
      z.object({
        "@type": z.enum(["Church", "PlaceOfWorship"]),
        name: z.string(),
        url: z.url(),
      }),
    )
    .optional(),
  event: z
    .array(
      z.object({
        "@type": z.literal("Event"),
        name: z.string(),
        startDate: z.string(),
        url: z.url(),
        location: z.object({ "@type": z.literal("Place"), name: z.string() }),
      }),
    )
    .optional(),
});

const LOCATION: Location = {
  id: "loc-1",
  tenantId: "t-1",
  name: "Minta-templom",
  slug: "minta-templom",
  kind: "templom",
  address: { postalCode: "2999", city: "Dunaliget", line1: "Templom tér 3.", line2: null },
  geo: { lat: 47.65, lng: 19.06 },
  openingHours: { weekly: [{ weekday: 7, from: "08:00", to: "12:00" }], exceptions: [] },
  accessibility: {
    wheelchair: true,
    accessibleToilet: false,
    hearingLoop: false,
    parking: false,
    note: null,
  },
  photoMediaId: null,
  sort: 0,
  createdAt: STAMP,
  updatedAt: STAMP,
};

describe("churchJsonLd", () => {
  const input = {
    denomination: "rk" as const,
    name: "Minta Plébánia",
    origin: ORIGIN,
    description: "Isten hozta!",
    contact: {
      email: "iroda@minta.example",
      phone: "+36 30 123 4567",
      address: { postalCode: "2999", city: "Dunaliget", line1: "Templom tér 3.", line2: "Iroda" },
    },
    integrations: { facebookUrl: "https://www.facebook.com/minta" },
    locations: [{ ...LOCATION, geo: null, slug: "elso" }, LOCATION],
    events: [
      {
        name: "Hittanóra",
        startDate: "2026-11-20T17:00:00+01:00",
        endDate: "2026-11-20T18:00:00+01:00",
        url: `${ORIGIN}/esemenyek/hittanora`,
      },
      {
        name: "Ifjúsági est",
        startDate: "2026-11-21",
        url: `${ORIGIN}/esemenyek/ifjusagi-est`,
        placeName: "Minta-templom",
      },
    ],
  };

  it("matches the Church schema with address, geo, contact, places and events", () => {
    const data = churchJsonLd(input);
    expect(ChurchJsonLd.safeParse(data).success).toBe(true);
    expect(data).toMatchObject({
      "@type": "CatholicChurch",
      "@id": `${ORIGIN}/#church`,
      url: `${ORIGIN}/`,
      description: "Isten hozta!",
      telephone: "+36301234567",
      geo: { latitude: 47.65, longitude: 19.06 },
      address: { streetAddress: "Templom tér 3., Iroda" },
      sameAs: ["https://www.facebook.com/minta"],
    });
    const places = data.containsPlace as Record<string, unknown>[];
    expect(places.map((p) => p.url)).toEqual([
      `${ORIGIN}/templomaink/elso`,
      `${ORIGIN}/templomaink/minta-templom`,
    ]);
    expect(places.every((p) => !("@context" in p))).toBe(true);
    const events = data.event as Record<string, unknown>[];
    expect(events[0]).toMatchObject({
      endDate: input.events[0]!.endDate,
      location: { name: "Minta Plébánia" },
    });
    expect(events[1]).not.toHaveProperty("endDate");
    expect(events[1]).toMatchObject({ location: { name: "Minta-templom" } });
  });

  it("omits what the church has not set", () => {
    const data = churchJsonLd({
      denomination: "ref",
      name: "Minta Egyházközség",
      origin: ORIGIN,
      contact: {},
      integrations: {},
      locations: [],
    });
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "Church",
      "@id": `${ORIGIN}/#church`,
      name: "Minta Egyházközség",
      url: `${ORIGIN}/`,
      isAccessibleForFree: true,
    });
  });

  it("uses CatholicChurch for the Catholic presets and Church otherwise", () => {
    expect(churchSchemaType("rk")).toBe("CatholicChurch");
    expect(churchSchemaType("gk")).toBe("CatholicChurch");
    for (const d of ["ref", "ev", "bapt", "unit", "general"] as const) {
      expect(churchSchemaType(d)).toBe("Church");
    }
  });
});
