import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { Announcement, Denomination, Media } from "@churchy/contracts";
import { effectiveConfig } from "@churchy/presets";
import type { MessageTree } from "@churchy/i18n";
import huMessages from "@messages/hu.json";
import { catalogFor, termsForDenomination } from "@/i18n/terms";
import {
  announcementHeading,
  announcementWeek,
  announcementsHref,
  archiveByYear,
  isArchiveView,
  neighbours,
  parsePageParam,
  parseWeekParam,
  publicFile,
  teaserLines,
  type HeadingTranslator,
} from "./view";

/** The real heading messages of a denomination, term placeholders resolved. */
function headingT(denomination: Denomination): HeadingTranslator {
  const messages = catalogFor(
    huMessages as unknown as MessageTree,
    termsForDenomination(denomination),
  );
  const t = createTranslator({
    locale: "hu",
    messages: messages as Record<string, unknown>,
    namespace: "public.announcements",
  } as never) as unknown as (key: string, values: Record<string, string>) => string;
  return (key, values) => t(key, values);
}

const familyOf = (denomination: Denomination) =>
  effectiveConfig({ name: denomination, denomination }).calendarFamily;

/** Ten reference Sundays across the church year (D-14 AC2), with the expected heading. */
const CATHOLIC: readonly [string, string][] = [
  ["2026-11-15", "Hirdetések — 2026. november 15. (Évközi 33. vasárnap)"],
  ["2026-11-22", "Hirdetések — 2026. november 22. (Krisztus Király)"],
  ["2026-11-29", "Hirdetések — 2026. november 29. (Advent 1. vasárnapja)"],
  ["2026-12-27", "Hirdetések — 2026. december 27. (A Szent Család ünnepe)"],
  ["2027-01-10", "Hirdetések — 2027. január 10. (Urunk megkeresztelkedése)"],
  ["2026-02-22", "Hirdetések — 2026. február 22. (Nagyböjt 1. vasárnapja)"],
  ["2026-03-29", "Hirdetések — 2026. március 29. (Virágvasárnap)"],
  ["2026-04-05", "Hirdetések — 2026. április 5. (Húsvétvasárnap)"],
  ["2026-05-31", "Hirdetések — 2026. május 31. (Szentháromság vasárnapja)"],
  // A solemnity on a Sunday takes its place in the heading.
  ["2026-11-01", "Hirdetések — 2026. november 1. (Mindenszentek)"],
];

const REFORMED: readonly [string, string][] = [
  ["2026-11-15", "Hirdetések — 2026. november 15. (Szentháromság ünnepe utáni 24. vasárnap)"],
  ["2026-11-22", "Hirdetések — 2026. november 22. (Szentháromság ünnepe utáni 25. vasárnap)"],
  ["2026-11-29", "Hirdetések — 2026. november 29. (Advent 1. vasárnapja)"],
  ["2026-12-27", "Hirdetések — 2026. december 27. (Karácsony utáni vasárnap)"],
  ["2027-01-10", "Hirdetések — 2027. január 10. (Vízkereszt utáni 1. vasárnap)"],
  ["2026-02-22", "Hirdetések — 2026. február 22. (Böjt 1. vasárnapja (Invocavit))"],
  ["2026-03-29", "Hirdetések — 2026. március 29. (Virágvasárnap (Palmarum))"],
  ["2026-04-05", "Hirdetések — 2026. április 5. (Húsvétvasárnap)"],
  ["2026-05-31", "Hirdetések — 2026. május 31. (Szentháromság ünnepe)"],
  ["2026-11-01", "Hirdetések — 2026. november 1. (Szentháromság ünnepe utáni 22. vasárnap)"],
];

describe("announcement week heading (D-14 AC2)", () => {
  it.each(CATHOLIC)("Catholic %s", (sunday, expected) => {
    expect(familyOf("rk")).toBe("catholic");
    expect(announcementHeading(sunday, familyOf("rk"), headingT("rk"))).toBe(expected);
  });

  it.each(REFORMED)("Reformed %s", (sunday, expected) => {
    expect(familyOf("ref")).toBe("protestant");
    expect(announcementHeading(sunday, familyOf("ref"), headingT("ref"))).toBe(expected);
  });

  it("the two traditions name the same ordinary Sunday differently", () => {
    const rk = announcementWeek("2026-11-15", "catholic").liturgicalName;
    const ref = announcementWeek("2026-11-15", "protestant").liturgicalName;
    expect(rk).not.toBe(ref);
  });

  it("week parts: Sunday date without weekday, Monday–Sunday range", () => {
    expect(announcementWeek("2026-11-15", "catholic")).toEqual({
      sunday: "2026-11-15",
      monday: "2026-11-09",
      dateLabel: "2026. november 15.",
      range: "nov. 9–15.",
      liturgicalName: "Évközi 33. vasárnap",
    });
    expect(announcementWeek("2027-01-03", "protestant").range).toBe(
      "2026. dec. 28. – 2027. jan. 3.",
    );
  });

  it("falls back to the plain heading when the calendar names nothing", () => {
    // A weekday without a celebration has no name; the heading drops the parentheses.
    expect(announcementWeek("2026-11-12", "catholic").liturgicalName).toBeNull();
    expect(announcementHeading("2026-11-12", "catholic", headingT("bapt"))).toBe(
      "Hirdetések — 2026. november 12.",
    );
  });

  it("rejects an invalid date", () => {
    expect(() => announcementWeek("2026-02-30", "catholic")).toThrow(RangeError);
  });
});

describe("URL state", () => {
  it("?het= selects the week's Sunday; only the Sunday itself is canonical", () => {
    expect(parseWeekParam(undefined)).toEqual({ kind: "none" });
    expect(parseWeekParam("")).toEqual({ kind: "none" });
    expect(parseWeekParam("2026-11-15")).toEqual({
      kind: "week",
      sunday: "2026-11-15",
      canonical: true,
    });
    expect(parseWeekParam("2026-11-12")).toEqual({
      kind: "week",
      sunday: "2026-11-15",
      canonical: false,
    });
    expect(parseWeekParam("2026. 11. 15.")).toEqual({
      kind: "week",
      sunday: "2026-11-15",
      canonical: false,
    });
    expect(parseWeekParam(["2026-11-16", "x"])).toMatchObject({ sunday: "2026-11-22" });
    expect(parseWeekParam("jövő hét")).toEqual({ kind: "invalid", raw: "jövő hét" });
    expect(parseWeekParam("2026-02-30").kind).toBe("invalid");
  });

  it("?oldal= and ?nezet=", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-2")).toBe(1);
    expect(parsePageParam("x")).toBe(1);
    expect(isArchiveView("archivum")).toBe(true);
    expect(isArchiveView(["archivum"])).toBe(true);
    expect(isArchiveView("lista")).toBe(false);
    expect(isArchiveView(undefined)).toBe(false);
  });

  it("builds links; defaults are left out", () => {
    expect(announcementsHref("/hirdetesek")).toBe("/hirdetesek");
    expect(announcementsHref("/hirdetesek", { week: "2026-11-08" })).toBe(
      "/hirdetesek?het=2026-11-08",
    );
    expect(announcementsHref("/hirdetesek", { archive: true })).toBe("/hirdetesek?nezet=archivum");
    expect(announcementsHref("/hirdetesek", { archive: true, page: 1 })).toBe(
      "/hirdetesek?nezet=archivum",
    );
    expect(announcementsHref("/hirdetesek", { archive: true, page: 2 })).toBe(
      "/hirdetesek?nezet=archivum&oldal=2",
    );
  });
});

const ann = (weekSunday: string, extra: Partial<Announcement> = {}): Announcement => ({
  id: `a-${weekSunday}`,
  tenantId: "t",
  weekSunday,
  body: null,
  pdfMediaId: null,
  status: "published",
  publishedAt: "2026-01-01T00:00:00+01:00",
  createdAt: "2026-01-01T00:00:00+01:00",
  updatedAt: "2026-01-01T00:00:00+01:00",
  ...extra,
});

describe("neighbours and archive", () => {
  const items = [ann("2026-11-15"), ann("2026-11-08"), ann("2026-10-25"), ann("2026-04-05")];

  it("finds the closest earlier and later weeks, skipping weeks without an announcement", () => {
    expect(neighbours(items, "2026-11-08")).toMatchObject({
      older: { weekSunday: "2026-10-25" },
      newer: { weekSunday: "2026-11-15" },
    });
    expect(neighbours(items, "2026-11-15")).toMatchObject({ newer: null });
    expect(neighbours(items, "2026-10-25").older?.weekSunday).toBe("2026-04-05");
    expect(neighbours(items, "2026-04-05").older).toBeNull();
    // A week without an announcement still has neighbours.
    expect(neighbours(items, "2026-11-01")).toMatchObject({
      older: { weekSunday: "2026-10-25" },
      newer: { weekSunday: "2026-11-08" },
    });
    expect(neighbours([], "2026-11-01")).toEqual({ older: null, newer: null });
  });

  it("groups the archive by year, newest first", () => {
    const groups = archiveByYear([ann("2025-12-28"), ...items]);
    expect(groups.map((g) => g.year)).toEqual([2026, 2025]);
    expect(groups[0]!.items.map((a) => a.weekSunday)).toEqual([
      "2026-11-15",
      "2026-11-08",
      "2026-10-25",
      "2026-04-05",
    ]);
    expect(archiveByYear([])).toEqual([]);
  });
});

const media = (extra: Partial<Media> = {}): Media => ({
  id: "m",
  tenantId: "t",
  kind: "pdf",
  filename: "heti-hirdetesek-minta.pdf",
  mimeType: "application/pdf",
  storageKey: "demo/minta-dokumentum.pdf",
  variants: [],
  width: null,
  height: null,
  bytes: 48_200,
  alt: null,
  decorative: false,
  caption: null,
  peopleConsent: false,
  visibility: "public",
  uploadedBy: null,
  createdAt: "2026-01-01T00:00:00+01:00",
  ...extra,
});

describe("PDF attachment", () => {
  it("serves the public demo placeholder with its name and size", () => {
    expect(publicFile(media())).toEqual({
      href: "/demo/minta-dokumentum.pdf",
      filename: "heti-hirdetesek-minta.pdf",
      kilobytes: 47,
    });
    expect(publicFile(media({ bytes: 10 }))?.kilobytes).toBe(1);
  });

  it("gives no link for private, non-PDF, missing or non-demo files", () => {
    expect(publicFile(null)).toBeNull();
    expect(publicFile(media({ visibility: "private" }))).toBeNull();
    expect(publicFile(media({ kind: "image" }))).toBeNull();
    expect(publicFile(media({ storageKey: "t/t-1/abc.pdf" }))).toBeNull();
    expect(publicFile(media({ storageKey: "demo/../secret.pdf" }))).toBeNull();
  });
});

describe("teaser lines", () => {
  const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  const li = (text: string) => ({ type: "listItem", content: [p(text)] });

  it("prefers the list items, then paragraphs; plain text only", () => {
    const body = {
      type: "doc" as const,
      content: [
        p("Kedves Testvérek!"),
        {
          type: "bulletList",
          content: [
            li("Első"),
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Második", marks: [{ type: "bold" }] },
                    { type: "text", text: " hír" },
                  ],
                },
              ],
            },
            li("Harmadik"),
            li("Negyedik"),
          ],
        },
      ],
    };
    expect(teaserLines(body, 3)).toEqual(["Első", "Második hír", "Harmadik"]);
    expect(teaserLines({ type: "doc", content: [p("Egy"), p(" "), p("Kettő")] }, 5)).toEqual([
      "Egy",
      "Kettő",
    ]);
    expect(teaserLines(null, 3)).toEqual([]);
    expect(teaserLines(body, 0)).toEqual([]);
  });
});
