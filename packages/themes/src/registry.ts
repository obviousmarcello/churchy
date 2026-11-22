import type {
  FontPairingId,
  HeroStyle,
  RadiusStep,
  ThemeColors,
  ThemeConfig,
  ThemeId,
} from "./types";

export interface FontPairing {
  /** CSS font stacks, including fallbacks. */
  heading: string;
  body: string;
  /** False until the font files are self-hosted by the stylesheet. */
  shipped: boolean;
}

const SANS_FALLBACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Each web font is followed by its size-adjusted local fallback face (css/fonts.css), so the font swap causes no layout shift. */

export const FONT_PAIRINGS: Record<FontPairingId, FontPairing> = {
  klasszikus: {
    heading:
      '"Cormorant Garamond", "Cormorant Garamond Fallback", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
    body: `"Source Sans 3", "Source Sans 3 Fallback", ${SANS_FALLBACK}`,
    shipped: true,
  },
  letisztult: {
    heading: `"Inter", "Inter Fallback", ${SANS_FALLBACK}`,
    body: `"Inter", "Inter Fallback", ${SANS_FALLBACK}`,
    shipped: true,
  },
  kozossegi: {
    heading: `"Nunito", "Nunito Fallback", ${SANS_FALLBACK}`,
    body: `"Nunito Sans", "Nunito Sans Fallback", ${SANS_FALLBACK}`,
    shipped: true,
  },
};

export interface RadiusScale {
  /** Chips inside controls, checkboxes, small swatches. */
  sm: string;
  /** Inputs and (in most themes) buttons. */
  md: string;
  /** Cards, table containers, images. */
  lg: string;
  /** Dialogs, popovers, menus, heroes. */
  xl: string;
}

/**
 * Corner radius steps (design v2: soft, modern shapes in every step). The ids are stored in site
 * configs, so they keep their names: `square` is the most restrained step, not literally square.
 * Each theme derives its semantic radii (`--radius-card`, `--radius-button` …) from the step in its
 * stylesheet, so a church's choice still changes every component.
 */
export const RADIUS_SCALES: Record<RadiusStep, RadiusScale> = {
  square: { sm: "8px", md: "12px", lg: "18px", xl: "22px" },
  soft: { sm: "10px", md: "14px", lg: "20px", xl: "24px" },
  round: { sm: "12px", md: "16px", lg: "26px", xl: "32px" },
};

export interface ThemeDefinition {
  id: ThemeId;
  /** Whether the theme's stylesheet exists yet. Others fall back to Klasszikus styling. */
  available: boolean;
  /** Page surface and body text colours; used for contrast maths on the configurable colours. */
  surface: string;
  /** Darkest background text is placed on (bands, table headers). */
  surfaceSunken: string;
  text: string;
  defaults: {
    colors: ThemeColors;
    fontPairing: FontPairingId;
    heroStyle: HeroStyle;
    radius: RadiusStep;
  };
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  klasszikus: {
    id: "klasszikus",
    available: true,
    surface: "#fbf6ea",
    surfaceSunken: "#f3ead6",
    text: "#2b2118",
    defaults: {
      colors: { primary: "#6e1f2e", accent: "#c9a24b" },
      fontPairing: "klasszikus",
      heroStyle: "image-full",
      radius: "soft",
    },
  },
  letisztult: {
    id: "letisztult",
    available: true,
    surface: "#fdfcfa",
    surfaceSunken: "#f1eee8",
    text: "#1c1b1a",
    defaults: {
      colors: { primary: "#1f3a5f", accent: "#e07a5f" },
      fontPairing: "letisztult",
      heroStyle: "text-only",
      radius: "square",
    },
  },
  kozossegi: {
    id: "kozossegi",
    available: true,
    surface: "#fffaf3",
    surfaceSunken: "#f6ecdd",
    text: "#2a2420",
    defaults: {
      colors: { primary: "#2f6f4e", accent: "#f2a541" },
      fontPairing: "kozossegi",
      heroStyle: "image-split",
      radius: "round",
    },
  },
};

export function defaultThemeConfig(themeId: ThemeId = "klasszikus"): ThemeConfig {
  const d = THEMES[themeId].defaults;
  return {
    themeId,
    colors: { ...d.colors },
    fontPairing: d.fontPairing,
    heroStyle: d.heroStyle,
    radius: d.radius,
  };
}
