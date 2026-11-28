import { describe, expect, it } from "vitest";
import type { HomeSection } from "@churchy/contracts";
import {
  ctaSettings,
  customTextSettings,
  homeBands,
  quoteSettings,
  sectionCount,
} from "./sections";

const s = (type: HomeSection["type"], settings: Record<string, unknown> = {}): HomeSection => ({
  id: `home-${type}`,
  type,
  settings,
});

describe("sectionCount", () => {
  it("accepts whole numbers 1-12, else the default", () => {
    expect(sectionCount({ count: 5 }, 3)).toBe(5);
    expect(sectionCount({ count: 99 }, 3)).toBe(12);
    expect(sectionCount({ count: 0 }, 3)).toBe(1);
    expect(sectionCount({ count: "4" }, 3)).toBe(3);
    expect(sectionCount({ count: 2.5 }, 3)).toBe(3);
    expect(sectionCount({}, 4)).toBe(4);
  });
});

describe("section settings", () => {
  it("quote needs text", () => {
    expect(quoteSettings({})).toBeNull();
    expect(quoteSettings({ text: " Vers ", source: "Zsolt 23" })).toEqual({
      text: "Vers",
      source: "Zsolt 23",
    });
  });
  it("cta needs a label and a safe href", () => {
    expect(ctaSettings({ label: "Gyere", href: "javascript:alert(1)" })).toBeNull();
    expect(ctaSettings({ label: "Gyere", href: "/kapcsolat" })).toMatchObject({
      label: "Gyere",
      href: "/kapcsolat",
      title: null,
    });
  });
  it("custom text needs text", () => {
    expect(customTextSettings({ title: "x" })).toBeNull();
    expect(customTextSettings({ text: "a" })?.text).toBe("a");
  });
});

describe("homeBands", () => {
  it("groups consecutive column sections and keeps the configured order", () => {
    const bands = homeBands([
      s("hero"),
      s("nextServices"),
      s("news"),
      s("announcements"),
      s("events"),
      s("map"),
      s("news"),
    ]);
    // The next-services strip is full width, right below the hero.
    expect(bands.map((b) => b.kind)).toEqual(["wide", "wide", "columns", "wide", "columns"]);
    const first = bands[2];
    if (first?.kind !== "columns") throw new Error("expected columns");
    expect(first.left.map((p) => p.order)).toEqual([3]);
    expect(first.right.map((p) => p.order)).toEqual([2, 4]);
  });
});
