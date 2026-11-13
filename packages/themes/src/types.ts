export const THEME_IDS = ["klasszikus", "letisztult", "kozossegi"] as const;
/** The three themes of FR-104. Only `klasszikus` ships styles today; the others are a later issue. */
export type ThemeId = (typeof THEME_IDS)[number];

export const HERO_STYLES = ["image-full", "image-split", "text-only"] as const;
export type HeroStyle = (typeof HERO_STYLES)[number];

/** Curated font pairings (FR-103). Ids match the theme that introduced them. */
export const FONT_PAIRING_IDS = ["klasszikus", "letisztult", "kozossegi"] as const;
export type FontPairingId = (typeof FONT_PAIRING_IDS)[number];

export const RADIUS_STEPS = ["square", "soft", "round"] as const;
export type RadiusStep = (typeof RADIUS_STEPS)[number];

/** `#rgb` or `#rrggbb`. */
export type HexColor = string;

export interface ThemeColors {
  /** Brand colour: buttons, links, header accents. Must reach 4.5:1 against the page surface. */
  primary: HexColor;
  /** Secondary / decorative colour (gold in Klasszikus). Used for rules, fills and badges. */
  accent: HexColor;
}

/**
 * Per-site appearance configuration (a theme = tokens + layout variants, never content).
 * Stored in the site config and turned into CSS variables at request time, so changing it needs no
 * rebuild.
 */
export interface ThemeConfig {
  themeId: ThemeId;
  colors: ThemeColors;
  fontPairing: FontPairingId;
  heroStyle: HeroStyle;
  radius: RadiusStep;
}

export type ThemeConfigInput = {
  themeId?: ThemeId;
  colors?: Partial<ThemeColors>;
  fontPairing?: FontPairingId;
  heroStyle?: HeroStyle;
  radius?: RadiusStep;
};

/** Custom-property map; usable as a React `style` object. */
export type CssVars = Record<`--${string}`, string>;
