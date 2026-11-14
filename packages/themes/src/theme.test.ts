import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  FONT_PAIRINGS,
  RADIUS_SCALES,
  THEMES,
  THEME_IDS,
  applyTheme,
  contrastRatio,
  defaultThemeConfig,
  isHexColor,
  meetsContrast,
  nearestAccessibleShade,
  readableTextOn,
  resolveThemeConfig,
  themeAttributes,
  themeToCssVars,
  themeToStyleText,
  validateThemeConfig,
} from "./index";

const css = (name: string) => readFileSync(new URL(`./css/${name}`, import.meta.url), "utf8");

/** Reads `--name: value;` declarations out of the first rule of a CSS file. */
function declarations(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!
      .replace(/\/\*.*?\*\//g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return out;
}

describe("contrast maths", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777", "#fff")).toBeCloseTo(4.48, 1);
  });

  it("validates hex colours", () => {
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("#AABBCC")).toBe(true);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#abcd")).toBe(false);
    expect(isHexColor(12)).toBe(false);
  });

  it("picks the readable foreground", () => {
    expect(readableTextOn("#6e1f2e")).toBe("#ffffff");
    expect(readableTextOn("#f5d27a")).toBe("#1a1410");
  });

  it("finds the nearest passing shade and keeps passing colours untouched", () => {
    expect(nearestAccessibleShade("#6e1f2e", "#fbf6ea")).toBe("#6e1f2e");
    const fixed = nearestAccessibleShade("#c9a24b", "#fbf6ea");
    expect(fixed).not.toBe("#c9a24b");
    expect(meetsContrast(fixed, "#fbf6ea")).toBe(true);
    // Dark surface: lightens instead of darkening.
    const onDark = nearestAccessibleShade("#552233", "#1a1410");
    expect(meetsContrast(onDark, "#1a1410")).toBe(true);
  });
});

describe("ThemeConfig -> CSS variables (runtime theming)", () => {
  it("emits the configurable tokens for the default config", () => {
    const vars = themeToCssVars(defaultThemeConfig());
    expect(vars["--c-primary"]).toBe("#6e1f2e");
    expect(vars["--c-primary-contrast"]).toBe("#ffffff");
    expect(vars["--c-accent"]).toBe("#c9a24b");
    expect(vars["--font-heading"]).toContain("Cormorant Garamond");
    expect(vars["--font-body"]).toContain("Source Sans 3");
    expect(vars["--radius-md"]).toBe("6px");
  });

  it("changes the variables when the config changes (no rebuild involved)", () => {
    const a = themeToCssVars(defaultThemeConfig());
    const b = themeToCssVars(
      resolveThemeConfig({ colors: { primary: "#0b3c5d", accent: "#f2c14e" }, radius: "round" }),
    );
    expect(b["--c-primary"]).toBe("#0b3c5d");
    expect(b["--c-primary"]).not.toBe(a["--c-primary"]);
    expect(b["--c-accent"]).toBe("#f2c14e");
    expect(b["--radius-md"]).toBe(RADIUS_SCALES.round.md);
  });

  it("derives readable foregrounds for any colour the editor chooses", () => {
    for (const primary of ["#0b3c5d", "#f2c14e", "#222222", "#e8e8e8", "#7a1fa2"]) {
      const vars = themeToCssVars(resolveThemeConfig({ colors: { primary } }));
      expect(contrastRatio(vars["--c-primary-contrast"]!, primary)).toBeGreaterThanOrEqual(4.5);
    }
    const gold = themeToCssVars(defaultThemeConfig());
    expect(meetsContrast(gold["--c-accent-text"]!, THEMES.klasszikus.surface)).toBe(true);
  });

  it("exposes data-theme + inline style for the root layout", () => {
    const attrs = themeAttributes(defaultThemeConfig());
    expect(attrs["data-theme"]).toBe("klasszikus");
    expect(attrs.style["--c-primary"]).toBe("#6e1f2e");
    expect(themeToStyleText(defaultThemeConfig())).toContain("--c-primary:#6e1f2e;");
  });

  it("applies the theme to a live element", () => {
    const setAttribute = vi.fn();
    const setProperty = vi.fn();
    applyTheme(
      { setAttribute, style: { setProperty } },
      resolveThemeConfig({ colors: { primary: "#0b3c5d" } }),
    );
    expect(setAttribute).toHaveBeenCalledWith("data-theme", "klasszikus");
    expect(setProperty).toHaveBeenCalledWith("--c-primary", "#0b3c5d");
  });

  it("falls back to defaults for malformed input instead of throwing", () => {
    const config = resolveThemeConfig({
      themeId: "nope" as never,
      colors: { primary: "javascript:alert(1)", accent: "#ZZZ" },
      heroStyle: "huge" as never,
      radius: 3 as never,
    });
    expect(config).toEqual(defaultThemeConfig());
    expect(resolveThemeConfig(null)).toEqual(defaultThemeConfig());
  });

  it("accepts every theme id, even those without styles yet", () => {
    for (const id of THEME_IDS) {
      expect(resolveThemeConfig({ themeId: id }).themeId).toBe(id);
      expect(THEMES[id].id).toBe(id);
    }
    expect(THEMES.klasszikus.available).toBe(true);
    expect(THEMES.letisztult.available).toBe(false);
    expect(FONT_PAIRINGS.klasszikus.shipped).toBe(true);
  });
});

describe("colour validation (FR-103)", () => {
  it("accepts the default palette", () => {
    expect(validateThemeConfig(defaultThemeConfig())).toEqual([]);
  });

  it("rejects a primary below 4.5:1 and proposes the nearest passing shade", () => {
    const config = resolveThemeConfig({ colors: { primary: "#d9a441" } });
    const [issue] = validateThemeConfig(config);
    expect(issue?.field).toBe("primary");
    expect(issue!.ratio).toBeLessThan(4.5);
    expect(meetsContrast(issue!.suggestion, THEMES.klasszikus.surface)).toBe(true);
  });
});

describe("Klasszikus stylesheet stays in sync with the registry", () => {
  const klasszikus = declarations(css("klasszikus.css"));
  const vars = themeToCssVars(defaultThemeConfig());
  const normalise = (s: string) => s.replace(/\s*,\s*/g, ",").replace(/"/g, "'");

  it("has the same configurable defaults", () => {
    for (const name of [
      "--c-primary",
      "--c-primary-contrast",
      "--c-accent",
      "--c-accent-contrast",
      "--c-accent-text",
      "--radius-sm",
      "--radius-md",
      "--radius-lg",
    ] as const) {
      expect(klasszikus[name], name).toBe(vars[name]);
    }
    expect(normalise(klasszikus["--font-heading"]!)).toBe(normalise(vars["--font-heading"]!));
    expect(normalise(klasszikus["--font-body"]!)).toBe(normalise(vars["--font-body"]!));
    expect(klasszikus["--c-surface"]).toBe(THEMES.klasszikus.surface);
    expect(klasszikus["--c-text"]).toBe(THEMES.klasszikus.text);
  });

  it("defines every SDD 5.4 token group", () => {
    const tokens = declarations(css("tokens.css"));
    for (let i = 1; i <= 7; i += 1) expect(tokens[`--fs-${i}`], `--fs-${i}`).toBeDefined();
    for (let i = 1; i <= 12; i += 1) expect(tokens[`--space-${i}`], `--space-${i}`).toBeDefined();
    expect(tokens["--fs-3"]).toBe("1.0625rem"); // 17 px base
    for (const name of [
      "--c-primary",
      "--c-primary-contrast",
      "--c-surface",
      "--c-text",
      "--c-muted",
      "--c-accent",
    ]) {
      expect(klasszikus[name], name).toBeDefined();
    }
    for (const name of ["--radius-sm", "--radius-md", "--radius-lg", "--shadow-card"]) {
      expect(klasszikus[name], name).toBeDefined();
    }
  });

  it("meets WCAG AA for every text pairing", () => {
    const pairs: Array<[string, string]> = [
      ["--c-text", "--c-surface"],
      ["--c-text", "--c-surface-raised"],
      ["--c-text", "--c-surface-sunken"],
      ["--c-muted", "--c-surface"],
      ["--c-muted", "--c-surface-raised"],
      ["--c-muted", "--c-surface-sunken"],
      ["--c-primary", "--c-surface"],
      ["--c-primary", "--c-surface-sunken"],
      ["--c-primary-contrast", "--c-primary"],
      ["--c-accent-text", "--c-surface"],
      ["--c-accent-text", "--c-surface-sunken"],
      ["--c-accent-contrast", "--c-accent"],
      ["--c-inverse-text", "--c-inverse"],
      ["--c-inverse-muted", "--c-inverse"],
      ["--c-inverse-accent", "--c-inverse"],
      ["--c-danger", "--c-danger-soft"],
      ["--c-success", "--c-success-soft"],
      ["--c-warning", "--c-warning-soft"],
      ["--c-info", "--c-info-soft"],
      ["--c-danger", "--c-surface"],
    ];
    for (const [fg, bg] of pairs) {
      expect(
        contrastRatio(klasszikus[fg]!, klasszikus[bg]!),
        `${fg} on ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    // Non-text UI (control borders, focus ring): 3:1.
    for (const bg of ["--c-surface", "--c-surface-raised"]) {
      expect(
        contrastRatio(klasszikus["--c-border-strong"]!, klasszikus[bg]!),
      ).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(klasszikus["--c-focus"]!, klasszikus[bg]!)).toBeGreaterThanOrEqual(3);
    }
  });

  it("meets WCAG AA in the admin variant (higher contrast)", () => {
    const admin = declarations(css("admin.css"));
    for (const [fg, bg] of [
      ["--c-text", "--c-surface"],
      ["--c-muted", "--c-surface"],
      ["--c-muted", "--c-surface-sunken"],
      ["--c-primary", "--c-surface"],
      ["--c-primary-contrast", "--c-primary"],
      ["--c-accent-text", "--c-surface"],
      ["--c-danger", "--c-danger-soft"],
      ["--c-success", "--c-success-soft"],
      ["--c-warning", "--c-warning-soft"],
      ["--c-info", "--c-info-soft"],
    ] as const) {
      expect(contrastRatio(admin[fg]!, admin[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(7);
    }
    expect(contrastRatio(admin["--c-border"]!, admin["--c-surface"]!)).toBeGreaterThanOrEqual(3);
  });

  it("ships latin and latin-ext faces with font-display: swap", () => {
    const fonts = css("fonts.css");
    expect(fonts.match(/@font-face/g)).toHaveLength(12);
    expect(fonts.match(/^\s+font-display: swap;/gm)).toHaveLength(12);
    expect(fonts).toContain("latin-ext-600-normal.woff2");
    expect(fonts).not.toMatch(/cyrillic|greek|vietnamese/);
  });
});
