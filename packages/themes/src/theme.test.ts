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
    expect(vars["--radius-md"]).toBe("14px");
    expect(vars["--radius-xl"]).toBe("24px");
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

  it("accepts every theme id; all three ship styles and fonts", () => {
    for (const id of THEME_IDS) {
      expect(resolveThemeConfig({ themeId: id }).themeId).toBe(id);
      expect(THEMES[id].id).toBe(id);
    }
    for (const id of THEME_IDS) {
      expect(THEMES[id].available, id).toBe(true);
      expect(FONT_PAIRINGS[THEMES[id].defaults.fontPairing].shipped, id).toBe(true);
    }
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

describe.each(THEME_IDS)("%s stylesheet stays in sync with the registry", (themeId) => {
  const klasszikus = declarations(css(`${themeId}.css`));
  const theme = THEMES[themeId];
  const vars = themeToCssVars(defaultThemeConfig(themeId));
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
      "--radius-xl",
    ] as const) {
      expect(klasszikus[name], name).toBe(vars[name]);
    }
    expect(normalise(klasszikus["--font-heading"]!)).toBe(normalise(vars["--font-heading"]!));
    expect(normalise(klasszikus["--font-body"]!)).toBe(normalise(vars["--font-body"]!));
    expect(klasszikus["--c-surface"]).toBe(theme.surface);
    expect(klasszikus["--c-surface-sunken"]).toBe(theme.surfaceSunken);
    expect(klasszikus["--c-text"]).toBe(theme.text);
  });

  it("styles its own selector and uses size-adjusted fallback fonts", () => {
    expect(css(`${themeId}.css`)).toContain(`[data-theme="${themeId}"]`);
    expect(vars["--font-heading"]).toContain(" Fallback");
    expect(validateThemeConfig(defaultThemeConfig(themeId))).toEqual([]);
  });

  it("defines every SDD 5.4 token group", () => {
    const tokens = declarations(css("tokens.css"));
    for (let i = 1; i <= 7; i += 1) expect(tokens[`--fs-${i}`], `--fs-${i}`).toBeDefined();
    for (let i = 1; i <= 12; i += 1) expect(tokens[`--space-${i}`], `--space-${i}`).toBeDefined();
    expect(tokens["--fs-3"]).toBe("1.0625rem"); // 17 px base
    expect(tokens["--fs-8"], "--fs-8 (hero display)").toBeDefined();
    for (const role of ["page-title", "section-title", "card-title", "body", "caption"]) {
      expect(tokens[`--fs-${role}`], role).toBeDefined();
    }
    for (const name of ["--c-divider", "--c-hover", "--c-selected", "--demo-bar-h"]) {
      expect(tokens[name], name).toBeDefined();
    }
    for (const name of [
      "--c-primary",
      "--c-primary-contrast",
      "--c-surface",
      "--c-text",
      "--c-muted",
      "--c-accent",
      "--fw-heading",
    ]) {
      expect(klasszikus[name], name).toBeDefined();
    }
    for (const name of [
      "--radius-sm",
      "--radius-md",
      "--radius-lg",
      "--shadow-xs",
      "--shadow-card",
      "--shadow-raised",
      "--shadow-overlay",
    ]) {
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
});

describe("shared stylesheet", () => {
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
    // Control borders reach 3:1 (WCAG 1.4.11); --c-border is a decorative hairline only.
    expect(
      contrastRatio(admin["--c-border-strong"]!, admin["--c-surface"]!),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(admin["--c-border-strong"]!, admin["--c-surface-sunken"]!),
    ).toBeGreaterThanOrEqual(3);
  });

  it("ships latin and latin-ext faces with font-display: swap", () => {
    const fonts = css("fonts.css");
    const faces = fonts.match(/@font-face \{[^}]*\}/g) ?? [];
    const web = faces.filter((f) => f.includes("woff2"));
    expect(web).toHaveLength(28);
    expect(web.every((f) => /font-display: swap;/.test(f))).toBe(true);
    expect(fonts).toContain("latin-ext-600-normal.woff2");
    expect(fonts).not.toMatch(/cyrillic|greek|vietnamese/);
    // Every family ships both subsets (ő/ű are latin-ext).
    for (const family of [
      "Cormorant Garamond",
      "Source Sans 3",
      "Inter",
      "Nunito",
      "Nunito Sans",
    ]) {
      const own = web.filter((f) => f.includes(`font-family: "${family}";`));
      expect(
        own.some((f) => f.includes("-latin-ext-")),
        family,
      ).toBe(true);
      expect(
        own.some((f) => /-latin-\d/.test(f)),
        family,
      ).toBe(true);
    }
  });

  it("gives every web font a size-adjusted local fallback (no layout shift on swap)", () => {
    const fonts = css("fonts.css");
    for (const pairing of Object.values(FONT_PAIRINGS)) {
      for (const stack of [pairing.heading, pairing.body]) {
        const first = stack.match(/^"([^"]+)"/)![1]!;
        expect(stack, first).toContain(`"${first} Fallback"`);
        const face = fonts.match(new RegExp(`font-family: "${first} Fallback";[^}]*}`))?.[0];
        expect(face, first).toBeDefined();
        expect(face).toMatch(/src: local\(/);
        expect(face).toMatch(/size-adjust: \d+(\.\d+)?%/);
        expect(face).toMatch(/ascent-override: /);
        expect(face).toMatch(/descent-override: /);
      }
    }
  });
});

describe("design v2: shape and motion tokens", () => {
  const semantic = [
    "--radius-control",
    "--radius-button",
    "--radius-card",
    "--radius-overlay",
    "--radius-tile",
    "--radius-image",
  ];
  const px = (value: string) => Number.parseFloat(value);

  it.each([...THEME_IDS, "admin"])("%s declares every semantic radius", (name) => {
    const decl = declarations(css(`${name}.css`));
    for (const token of semantic) expect(decl[token], token).toBeDefined();
  });

  it("keeps the themes distinct and every step soft", () => {
    expect(declarations(css("kozossegi.css"))["--radius-button"]).toBe("9999px");
    const card = (step: keyof typeof RADIUS_SCALES) => px(RADIUS_SCALES[step].lg);
    expect(card("square")).toBeLessThan(card("soft"));
    expect(card("soft")).toBeLessThan(card("round"));
    // Every step is modern: cards at least 16 px, overlays at least 20 px.
    for (const scale of Object.values(RADIUS_SCALES)) {
      expect(px(scale.lg)).toBeGreaterThanOrEqual(16);
      expect(px(scale.xl)).toBeGreaterThanOrEqual(20);
    }
  });

  it("defines the motion scale and easings, and zeroes movement under reduced motion", () => {
    const tokens = css("tokens.css");
    const decl = declarations(tokens);
    expect([decl["--dur-1"], decl["--dur-2"], decl["--dur-3"], decl["--dur-4"]]).toEqual([
      "120ms",
      "200ms",
      "320ms",
      "480ms",
    ]);
    const theme = declarations(css("tailwind.css"));
    for (const ease of ["--ease-standard", "--ease-emphasized", "--ease-exit", "--ease-spring"]) {
      expect(theme[ease], ease).toMatch(/^cubic-bezier\(/);
    }
    const reduced = tokens.slice(tokens.indexOf("prefers-reduced-motion: reduce"));
    expect(reduced).toMatch(/--motion-lift: 0px/);
    expect(reduced).toMatch(/--motion-press: 1/);
    expect(reduced).toMatch(/--motion-rise: 0px/);
  });

  it("guards motion with reduced motion and keeps view transitions non-blocking", () => {
    const motion = css("motion.css");
    expect(motion).toMatch(/::view-transition \{\s*pointer-events: none;/);
    expect(motion).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) and \(scripting: enabled\) \{\s*@view-transition/,
    );
    expect(motion).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\[data-reveal\]/);
  });
});
