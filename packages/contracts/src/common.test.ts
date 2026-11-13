import { describe, expect, it } from "vitest";
import { foldForSearch, huCollator, isPubliclyVisible, paginate } from "./common";
import {
  IsoDateSchema,
  IsoDateTimeSchema,
  IsoTimeSchema,
  IsoWeekdaySchema,
  MusicalKeySchema,
  PhoneSchema,
  RichTextSchema,
  SlugSchema,
  isoWeekdayOf,
} from "./primitives";

const NOW = new Date("2026-11-13T12:00:00+01:00");

describe("primitives", () => {
  it("validates civil dates, times and instants", () => {
    expect(IsoDateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(IsoDateSchema.safeParse("2026-02-29").success).toBe(false);
    expect(IsoDateSchema.safeParse("2026.11.13").success).toBe(false);
    expect(IsoTimeSchema.safeParse("07:05").success).toBe(true);
    expect(IsoTimeSchema.safeParse("7:05").success).toBe(false);
    expect(IsoTimeSchema.safeParse("24:00").success).toBe(false);
    expect(IsoDateTimeSchema.safeParse("2026-11-15T10:00:00+01:00").success).toBe(true);
    expect(IsoDateTimeSchema.safeParse("2026-11-15T10:00:00Z").success).toBe(true);
    expect(IsoDateTimeSchema.safeParse("2026-11-15T10:00:00").success).toBe(false);
    expect(IsoWeekdaySchema.safeParse(7).success).toBe(true);
    expect(IsoWeekdaySchema.safeParse(0).success).toBe(false);
  });

  it("validates slugs, phones, keys and rich text", () => {
    expect(SlugSchema.safeParse("szent-anna-kapolna").success).toBe(true);
    expect(SlugSchema.safeParse("szent-anna-kápolna").success).toBe(false);
    expect(PhoneSchema.safeParse("+36 30 123 4567").success).toBe(true);
    expect(PhoneSchema.safeParse("hívjon").success).toBe(false);
    expect(MusicalKeySchema.safeParse("F#m").success).toBe(true);
    expect(MusicalKeySchema.safeParse("Bb").success).toBe(true);
    expect(MusicalKeySchema.safeParse("H").success).toBe(false);
    expect(RichTextSchema.parse({ type: "doc" })).toEqual({ type: "doc", content: [] });
    expect(RichTextSchema.safeParse("<p>html</p>").success).toBe(false);
  });

  it("computes the ISO weekday independent of the process time zone", () => {
    expect(isoWeekdayOf("2026-11-15")).toBe(7);
    expect(isoWeekdayOf("2026-11-16")).toBe(1);
    expect(isoWeekdayOf("2026-03-29")).toBe(7); // DST switch day
  });
});

describe("isPubliclyVisible", () => {
  it("needs published status and a past publishedAt", () => {
    expect(isPubliclyVisible({ status: "draft", publishedAt: null }, NOW)).toBe(false);
    expect(isPubliclyVisible({ status: "published", publishedAt: null }, NOW)).toBe(false);
    expect(
      isPubliclyVisible({ status: "published", publishedAt: "2026-11-13T11:00:00+01:00" }, NOW),
    ).toBe(true);
    expect(
      isPubliclyVisible({ status: "published", publishedAt: "2026-11-13T13:00:00+01:00" }, NOW),
    ).toBe(false);
  });

  it("hides expired content", () => {
    const base = { status: "published", publishedAt: "2026-11-01T00:00:00+01:00" };
    expect(isPubliclyVisible({ ...base, expiresAt: "2026-11-13T12:00:00+01:00" }, NOW)).toBe(false);
    expect(isPubliclyVisible({ ...base, expiresAt: "2026-11-14T00:00:00+01:00" }, NOW)).toBe(true);
    expect(isPubliclyVisible({ ...base, expiresAt: null }, NOW)).toBe(true);
  });
});

describe("helpers", () => {
  it("paginates", () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    expect(paginate(rows)).toMatchObject({ total: 25, page: 1, pageSize: 20 });
    expect(paginate(rows, { page: 2, pageSize: 12 }).items).toEqual([
      12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ]);
    expect(() => paginate(rows, { page: 0 })).toThrow();
  });

  it("sorts with Hungarian collation and folds accents for search", () => {
    expect(["Zoltán", "Ödön", "Ábel", "Olga"].sort(huCollator.compare)).toEqual([
      "Ábel",
      "Olga",
      "Ödön",
      "Zoltán",
    ]);
    expect(foldForSearch("Áldott LÉGY, Uram ő ű")).toBe("aldott legy, uram o u");
  });
});
