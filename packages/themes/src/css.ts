import { nearestAccessibleShade, readableTextOn } from "./contrast";
import { FONT_PAIRINGS, RADIUS_SCALES, THEMES } from "./registry";
import type { CssVars, ThemeId, ThemeConfig } from "./types";

/**
 * The runtime half of the theme system. Turns a ThemeConfig into the custom properties that the
 * stylesheet (`@churchy/themes/styles.css`) and every component read, so changing the config changes
 * the look on the next request, without a rebuild.
 *
 * Only configurable tokens are emitted; the fixed structure (neutrals, spacing, type scale) comes
 * from the static stylesheet.
 */
export function themeToCssVars(config: ThemeConfig): CssVars {
  const theme = THEMES[config.themeId];
  const { primary, accent } = config.colors;
  const pairing = FONT_PAIRINGS[config.fontPairing];
  const radius = RADIUS_SCALES[config.radius];
  return {
    "--c-primary": primary,
    "--c-primary-contrast": readableTextOn(primary),
    "--c-accent": accent,
    "--c-accent-contrast": readableTextOn(accent, "#ffffff", theme.text),
    "--c-accent-text": nearestAccessibleShade(accent, theme.surfaceSunken),
    "--font-heading": pairing.heading,
    "--font-body": pairing.body,
    "--radius-sm": radius.sm,
    "--radius-md": radius.md,
    "--radius-lg": radius.lg,
  };
}

export interface ThemeAttributes {
  "data-theme": ThemeId;
  style: CssVars;
}

/** Spread on `<html>` (or any scope element): `<html {...themeAttributes(config)}>`. */
export function themeAttributes(config: ThemeConfig): ThemeAttributes {
  return { "data-theme": config.themeId, style: themeToCssVars(config) };
}

/** `--a:1;--b:2` text for a `style` attribute or a `<style>` rule body. */
export function themeToStyleText(config: ThemeConfig): string {
  return Object.entries(themeToCssVars(config))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

/** The smallest element surface `applyTheme` needs; satisfied by any HTMLElement. */
export interface ThemeTarget {
  setAttribute(name: string, value: string): void;
  style: { setProperty(name: string, value: string): void };
}

/** Client-side counterpart for live previews: re-themes an element in place. */
export function applyTheme(target: ThemeTarget, config: ThemeConfig): void {
  target.setAttribute("data-theme", config.themeId);
  for (const [name, value] of Object.entries(themeToCssVars(config))) {
    target.style.setProperty(name, value);
  }
}
