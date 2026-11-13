import {
  AA_TEXT,
  contrastRatio,
  isHexColor,
  nearestAccessibleShade,
  readableTextOn,
} from "./contrast";
import { THEMES, defaultThemeConfig } from "./registry";
import {
  FONT_PAIRING_IDS,
  HERO_STYLES,
  RADIUS_STEPS,
  THEME_IDS,
  type ThemeConfig,
  type ThemeConfigInput,
} from "./types";

function oneOf<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * Builds a complete ThemeConfig from loose input (site config JSON, query string). Unknown ids and
 * malformed colours silently fall back to the theme defaults, so a bad value can never break
 * rendering. Colour *contrast* is checked separately by `validateThemeConfig`.
 */
export function resolveThemeConfig(input: ThemeConfigInput | null | undefined = {}): ThemeConfig {
  const raw: Record<string, unknown> = (input ?? {}) as Record<string, unknown>;
  const themeId = oneOf(THEME_IDS, raw.themeId) ?? "klasszikus";
  const base = defaultThemeConfig(themeId);
  const colors = (raw.colors ?? {}) as Record<string, unknown>;
  return {
    themeId,
    colors: {
      primary: isHexColor(colors.primary) ? colors.primary.toLowerCase() : base.colors.primary,
      accent: isHexColor(colors.accent) ? colors.accent.toLowerCase() : base.colors.accent,
    },
    fontPairing: oneOf(FONT_PAIRING_IDS, raw.fontPairing) ?? base.fontPairing,
    heroStyle: oneOf(HERO_STYLES, raw.heroStyle) ?? base.heroStyle,
    radius: oneOf(RADIUS_STEPS, raw.radius) ?? base.radius,
  };
}

export interface ThemeColorIssue {
  field: "primary";
  /** Measured contrast of the colour against its pair. */
  ratio: number;
  required: number;
  /** Nearest shade of the chosen colour that passes (FR-103). */
  suggestion: string;
}

/**
 * FR-103: a brand colour must reach 4.5:1 against the page surface (it is used for links and button
 * fills) and have a readable foreground. Returns an empty list when the config can be saved.
 */
export function validateThemeConfig(config: ThemeConfig): ThemeColorIssue[] {
  const { surface } = THEMES[config.themeId];
  const issues: ThemeColorIssue[] = [];
  const { primary } = config.colors;
  const onSurface = contrastRatio(primary, surface);
  const onPrimary = contrastRatio(readableTextOn(primary), primary);
  const ratio = Math.min(onSurface, onPrimary);
  if (ratio < AA_TEXT) {
    issues.push({
      field: "primary",
      ratio,
      required: AA_TEXT,
      suggestion: nearestAccessibleShade(primary, surface),
    });
  }
  return issues;
}
