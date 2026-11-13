import type { HexColor } from "./types";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is HexColor {
  return typeof value === "string" && HEX.test(value);
}

type Rgb = readonly [number, number, number];

function parseHex(hex: HexColor): Rgb {
  if (!isHexColor(hex)) throw new Error(`Not a hex colour: ${String(hex)}`);
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: Rgb): HexColor {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(hex: HexColor): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1..21. */
export function contrastRatio(a: HexColor, b: HexColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const AA_TEXT = 4.5;

export function meetsContrast(fg: HexColor, bg: HexColor, min = AA_TEXT): boolean {
  return contrastRatio(fg, bg) >= min;
}

/** The more readable of two candidate foregrounds on `bg`. */
export function readableTextOn(
  bg: HexColor,
  light: HexColor = "#ffffff",
  dark: HexColor = "#1a1410",
) {
  return contrastRatio(light, bg) >= contrastRatio(dark, bg) ? light : dark;
}

function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

/**
 * Nearest shade of `fg` (same hue, moved towards black or white) that reaches `min` contrast on
 * `bg`. Returns `fg` unchanged when it already passes (FR-103: "nearest passing shade").
 */
export function nearestAccessibleShade(fg: HexColor, bg: HexColor, min = AA_TEXT): HexColor {
  if (meetsContrast(fg, bg, min)) return fg;
  const start = parseHex(fg);
  const towardBlack = relativeLuminance(bg) > 0.5;
  const target: Rgb = towardBlack ? [0, 0, 0] : [255, 255, 255];
  for (let step = 1; step <= 100; step += 1) {
    const candidate = toHex(mix(start, target, step / 100));
    if (meetsContrast(candidate, bg, min)) return candidate;
  }
  return toHex(target);
}
