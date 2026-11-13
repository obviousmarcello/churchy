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
  /** False until the font files are self-hosted by the stylesheet (later issue for 2 of 3). */
  shipped: boolean;
}

const SANS_FALLBACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const FONT_PAIRINGS: Record<FontPairingId, FontPairing> = {
  klasszikus: {
    heading:
      '"Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
    body: `"Source Sans 3", ${SANS_FALLBACK}`,
    shipped: true,
  },
  letisztult: {
    heading: `"Inter", ${SANS_FALLBACK}`,
    body: `"Inter", ${SANS_FALLBACK}`,
    shipped: false,
  },
  kozossegi: {
    heading: `"Nunito", ${SANS_FALLBACK}`,
    body: `"Nunito Sans", ${SANS_FALLBACK}`,
    shipped: false,
  },
};

export interface RadiusScale {
  sm: string;
  md: string;
  lg: string;
}

export const RADIUS_SCALES: Record<RadiusStep, RadiusScale> = {
  square: { sm: "0px", md: "0px", lg: "2px" },
  soft: { sm: "3px", md: "6px", lg: "10px" },
  round: { sm: "8px", md: "16px", lg: "28px" },
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
  // Placeholders: structure is ready, styling lands with the later theme issue.
  letisztult: {
    id: "letisztult",
    available: false,
    surface: "#ffffff",
    surfaceSunken: "#f4f4f4",
    text: "#16181d",
    defaults: {
      colors: { primary: "#1f3a5f", accent: "#e07a5f" },
      fontPairing: "letisztult",
      heroStyle: "text-only",
      radius: "square",
    },
  },
  kozossegi: {
    id: "kozossegi",
    available: false,
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
