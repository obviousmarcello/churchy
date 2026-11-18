import {
  THEMES,
  contrastRatio,
  isHexColor,
  validateThemeConfig,
  type ThemeConfig,
  type ThemeId,
} from "@churchy/themes";
import { FONT_PAIRING, RADIUS, storedThemeToConfig, type StoredTheme } from "@/lib/site-config";

/**
 * Pure helpers of the branding / theme editor (FR-103, FR-104, D-24). The editor works on the
 * stored (contract) theme shape and previews it as a `@churchy/themes` config.
 */

/** Inverse of the contract → themes mappings in `site-config.ts`. */
const FONT_PAIRING_KEY = Object.fromEntries(
  Object.entries(FONT_PAIRING).map(([key, id]) => [id, key]),
) as Record<ThemeConfig["fontPairing"], StoredTheme["fontPairing"]>;

const RADIUS_KEY = Object.fromEntries(
  Object.entries(RADIUS).map(([key, step]) => [step, key]),
) as Record<ThemeConfig["radius"], StoredTheme["radius"]>;

/** Choosing a theme adopts its fonts, corner radius and hero style and keeps the church's colours. */
export function selectTheme(theme: StoredTheme, themeId: ThemeId): StoredTheme {
  const d = THEMES[themeId].defaults;
  return {
    ...theme,
    themeId,
    fontPairing: FONT_PAIRING_KEY[d.fontPairing],
    heroStyle: d.heroStyle,
    radius: RADIUS_KEY[d.radius],
  };
}

/** The theme's own palette, for the *reset colours* action. */
export function themeDefaultColors(themeId: ThemeId): { primary: string; secondary: string } {
  const { primary, accent } = THEMES[themeId].defaults.colors;
  return { primary, secondary: accent };
}

export type ColorCheck =
  | { ok: true; ratio: number }
  | { ok: false; reason: "format" }
  | { ok: false; reason: "contrast"; ratio: number; suggestion: string };

/**
 * FR-103: the brand colour must reach 4.5:1 on the page surface (links, buttons) and carry readable
 * button text. A failing colour is refused and the nearest passing shade is suggested. The secondary
 * colour only needs to be a valid colour: its text and button pairs are derived automatically.
 */
export function checkColors(theme: StoredTheme): {
  primary: ColorCheck;
  secondary: ColorCheck;
} {
  const secondary: ColorCheck = isHexColor(theme.colors.secondary)
    ? { ok: true, ratio: 0 }
    : { ok: false, reason: "format" };
  if (!isHexColor(theme.colors.primary)) {
    return { primary: { ok: false, reason: "format" }, secondary };
  }
  const [issue] = validateThemeConfig(storedThemeToConfig(theme));
  return {
    primary: issue
      ? { ok: false, reason: "contrast", ratio: issue.ratio, suggestion: issue.suggestion }
      : { ok: true, ratio: ratioOf(theme) },
    secondary,
  };
}

/** Contrast of the brand colour on the page surface of the theme. */
function ratioOf(theme: StoredTheme): number {
  const config = storedThemeToConfig(theme);
  return contrastRatio(config.colors.primary, THEMES[config.themeId].surface);
}

export function canSaveBranding(theme: StoredTheme): boolean {
  const { primary, secondary } = checkColors(theme);
  return primary.ok && secondary.ok;
}
