import { describe, expect, it } from "vitest";
import type { HomeSection, NavItem } from "@churchy/contracts";
import { contrastRatio, THEMES } from "@churchy/themes";
import { PLATFORM_DEFAULTS } from "@churchy/presets";
import { storedThemeToConfig } from "@/lib/site-config";
import { canSaveBranding, checkColors, selectTheme, themeDefaultColors } from "./branding";
import {
  HOME_SECTION_TYPES,
  addSection,
  addableTypes,
  homeProblems,
  moveSection,
  newSectionId,
  removeSection,
  updateSettings,
} from "./home-composer";
import {
  addItem,
  canIndent,
  hrefValid,
  indentItem,
  moveItem,
  navigationIssues,
  outdentItem,
  removeItem,
  updateItem,
} from "./navigation-editor";

const section = (id: string, type: HomeSection["type"], settings = {}): HomeSection => ({
  id,
  type,
  settings,
});
const link = (label: string, href = `/${label}`) => ({ label, href, external: false });
const item = (label: string, children: string[] = []): NavItem => ({
  ...link(label),
  children: children.map((c) => link(c)),
});
const labels = (items: readonly NavItem[]) => items.map((i) => i.label);

describe("home composer", () => {
  it("offers at least ten section types", () => {
    expect(HOME_SECTION_TYPES.length).toBeGreaterThanOrEqual(10);
  });

  it("adds, removes and reorders sections", () => {
    let list: HomeSection[] = [];
    for (const type of ["hero", "news", "events"] as const) {
      list = addSection(list, type, newSectionId(list, type));
    }
    expect(list.map((s) => s.type)).toEqual(["hero", "news", "events"]);
    expect(list[1]!.settings).toEqual({ count: 3 });
    list = moveSection(list, list[2]!.id, -2);
    expect(list.map((s) => s.type)).toEqual(["events", "hero", "news"]);
    expect(moveSection(list, list[0]!.id, -5).map((s) => s.type)).toEqual([
      "events",
      "hero",
      "news",
    ]);
    expect(moveSection(list, "missing", 1)).toEqual(list);
    expect(removeSection(list, list[1]!.id).map((s) => s.type)).toEqual(["events", "news"]);
  });

  it("creates unique ids", () => {
    const list = [section("quote-2", "quote")];
    const id = newSectionId(list, "quote");
    expect(list.some((s) => s.id === id)).toBe(false);
  });

  it("offers only repeatable types again, and nothing of disabled modules", () => {
    const list = [section("a", "hero"), section("b", "quote")];
    const types = addableTypes(list, { news: true, events: false, schedule: true });
    expect(types).not.toContain("hero");
    expect(types).toContain("quote");
    expect(types).toContain("news");
    expect(types).not.toContain("events");
    expect(types).not.toContain("livestream");
  });

  it("sets and clears settings without mutating", () => {
    const list = [section("a", "cta", { label: "Gomb" })];
    const next = updateSettings(list, "a", { label: "", href: "/kapcsolat" });
    expect(next[0]!.settings).toEqual({ href: "/kapcsolat" });
    expect(list[0]!.settings).toEqual({ label: "Gomb" });
  });

  it("reports sections that would not render", () => {
    const problems = homeProblems([
      section("q", "quote"),
      section("c", "cta", { label: "Gomb", href: "javascript:alert(1)" }),
      section("t", "customText", { text: "Szöveg" }),
      section("n", "news", { count: 99 }),
      section("ok", "events", { count: 4 }),
    ]);
    expect(problems).toEqual({ q: ["quoteText"], c: ["ctaHref"], n: ["count"] });
  });
});

describe("navigation editor", () => {
  const base = [item("A"), item("B", ["B1", "B2"]), item("C")];

  it("moves items among their siblings", () => {
    expect(labels(moveItem(base, [2], -1))).toEqual(["A", "C", "B"]);
    expect(moveItem(base, [1, 1], -1)[1]!.children.map((c) => c.label)).toEqual(["B2", "B1"]);
    expect(labels(moveItem(base, [0], -1))).toEqual(["A", "B", "C"]);
  });

  it("nests under the previous item and never deeper than two levels", () => {
    expect(canIndent(base, [0])).toBe(false);
    expect(canIndent(base, [1])).toBe(false); // has children of its own
    expect(canIndent(base, [2])).toBe(true);
    const nested = indentItem(base, [2]);
    expect(labels(nested)).toEqual(["A", "B"]);
    expect(nested[1]!.children.map((c) => c.label)).toEqual(["B1", "B2", "C"]);
    expect(indentItem(base, [1])).toEqual(base);
    expect(labels(outdentItem(nested, [1, 0]))).toEqual(["A", "B", "B1"]);
  });

  it("adds, renames and removes", () => {
    const added = addItem(base, link("D"));
    expect(labels(added)).toEqual(["A", "B", "C", "D"]);
    expect(addItem(base, link("X"), 0)[0]!.children.map((c) => c.label)).toEqual(["X"]);
    expect(updateItem(base, [1, 0], { label: "Új" })[1]!.children[0]!.label).toBe("Új");
    expect(labels(removeItem(base, [1]))).toEqual(["A", "C"]);
    expect(removeItem(base, [1, 0])[1]!.children).toHaveLength(1);
  });

  it("limits the top level to 12 items", () => {
    const full = Array.from({ length: 12 }, (_, i) => item(`i${i}`));
    expect(addItem(full, link("x"))).toHaveLength(12);
  });

  it("derives `external` from the address", () => {
    const [first] = updateItem([item("A")], [0], { href: "https://pelda.hu/oldal" });
    expect(first!.external).toBe(true);
    expect(updateItem([first!], [0], { href: "/hirek" })[0]!.external).toBe(false);
  });

  it("accepts internal paths and http(s) addresses only", () => {
    for (const ok of ["/hirek", "/a/b?x=1", "https://pelda.hu", "http://pelda.hu/x"]) {
      expect(hrefValid(ok), ok).toBe(true);
    }
    for (const bad of [
      "",
      "hirek",
      "//evil.example",
      "javascript:alert(1)",
      "ftp://pelda.hu",
      "/a b",
      "https://x",
    ]) {
      expect(hrefValid(bad), bad).toBe(false);
    }
  });

  it("lists what blocks saving", () => {
    const issues = navigationIssues([
      item("A"),
      { ...item("B", ["C"]), label: " " },
      { ...link("D"), href: "x", children: [] },
    ]);
    expect(issues).toEqual([
      { path: [1], problem: "label" },
      { path: [2], problem: "href" },
    ]);
    expect(navigationIssues(base)).toEqual([]);
  });
});

describe("branding", () => {
  const stored = PLATFORM_DEFAULTS.theme;

  it("adopts the theme's own fonts, radius and hero style but keeps the colours", () => {
    const next = selectTheme(
      { ...stored, colors: { primary: "#123456", secondary: "#c9a24b" } },
      "kozossegi",
    );
    expect(next).toMatchObject({
      themeId: "kozossegi",
      fontPairing: "modern-sans",
      radius: "large",
      heroStyle: "image-split",
      colors: { primary: "#123456" },
    });
    expect(selectTheme(stored, "letisztult")).toMatchObject({
      fontPairing: "humanist",
      radius: "none",
      heroStyle: "text-only",
    });
    // Round trip: the stored shape previews as the theme.
    expect(storedThemeToConfig(selectTheme(stored, "letisztult")).themeId).toBe("letisztult");
  });

  it("blocks a primary colour below 4.5:1 and suggests a passing shade", () => {
    const bad = { ...stored, colors: { ...stored.colors, primary: "#d9a441" } };
    const { primary } = checkColors(bad);
    expect(primary.ok).toBe(false);
    if (primary.ok || primary.reason !== "contrast") throw new Error("expected a contrast issue");
    expect(contrastRatio(primary.suggestion, THEMES[bad.themeId].surface)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(canSaveBranding(bad)).toBe(false);
    expect(
      canSaveBranding({ ...bad, colors: { ...bad.colors, primary: primary.suggestion } }),
    ).toBe(true);
  });

  it("blocks malformed colours", () => {
    expect(
      checkColors({ ...stored, colors: { ...stored.colors, primary: "piros" } }).primary,
    ).toEqual({
      ok: false,
      reason: "format",
    });
    expect(canSaveBranding({ ...stored, colors: { ...stored.colors, secondary: "#zzz" } })).toBe(
      false,
    );
  });

  it("passes every theme's own palette", () => {
    for (const id of ["klasszikus", "letisztult", "kozossegi"] as const) {
      const theme = selectTheme({ ...stored, colors: themeDefaultColors(id) }, id);
      expect(canSaveBranding(theme), id).toBe(true);
    }
  });
});
