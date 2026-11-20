import type { HomeSection } from "@churchy/contracts";
import { safeHref } from "@churchy/ui";

/**
 * Per-section settings of the home composer (FR-107). The settings of a section are stored as an
 * open record; these readers take only what the home page understands and ignore the rest, so a
 * missing or malformed value never breaks the page.
 */

/** Cards / rows a list section shows when its settings do not say. */
export const DEFAULT_COUNT = { news: 3, events: 4 } as const;
const MAX_COUNT = 12;

/** `settings.count` as a whole number from 1 to 12, else the default. */
export function sectionCount(settings: HomeSection["settings"], fallback: number): number {
  const value = settings.count;
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.min(Math.max(value, 1), MAX_COUNT);
}

function text(value: unknown, max = 600): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" || trimmed.length > max ? null : trimmed;
}

export interface QuoteSettings {
  text: string;
  source: string | null;
}

/** A verse / quote section needs its `text`; without it the section is left out. */
export function quoteSettings(settings: HomeSection["settings"]): QuoteSettings | null {
  const body = text(settings.text);
  return body === null ? null : { text: body, source: text(settings.source, 120) };
}

export interface CtaSettings {
  title: string | null;
  text: string | null;
  label: string;
  href: string;
}

/** A call to action needs a button `label` and a safe `href`. */
export function ctaSettings(settings: HomeSection["settings"]): CtaSettings | null {
  const label = text(settings.label, 60);
  const href = safeHref(settings.href);
  if (label === null || href === null) return null;
  return { title: text(settings.title, 120), text: text(settings.text), label, href };
}

export interface CustomTextSettings {
  title: string | null;
  text: string;
}

/** Free text (plain paragraphs separated by blank lines) with an optional title. */
export function customTextSettings(settings: HomeSection["settings"]): CustomTextSettings | null {
  const body = text(settings.text, 4000);
  return body === null ? null : { title: text(settings.title, 120), text: body };
}

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

export interface PlacedSection {
  section: HomeSection;
  /** Position in the configured order: keeps that order on a phone, where columns collapse. */
  order: number;
}

export type Band =
  /** Full-bleed or full-width section (hero, livestream, map, quote, call to action, text). */
  | { kind: "wide"; section: HomeSection }
  /** Two columns from 1024 px (SDD §7.1): services and announcements left, news and events right. */
  | { kind: "columns"; left: PlacedSection[]; right: PlacedSection[] };

const LEFT: ReadonlySet<HomeSection["type"]> = new Set(["nextServices", "announcements"]);
const RIGHT: ReadonlySet<HomeSection["type"]> = new Set(["news", "events"]);

/**
 * Splits the configured sections into bands. Consecutive column sections share one two-column
 * band; every other section is a band of its own, so the configured order is never reshuffled
 * across a full-width section.
 */
export function homeBands(sections: readonly HomeSection[]): Band[] {
  const bands: Band[] = [];
  sections.forEach((section, order) => {
    const side = LEFT.has(section.type) ? "left" : RIGHT.has(section.type) ? "right" : null;
    if (side === null) {
      bands.push({ kind: "wide", section });
      return;
    }
    let band = bands.at(-1);
    if (band?.kind !== "columns") {
      band = { kind: "columns", left: [], right: [] };
      bands.push(band);
    }
    band[side].push({ section, order });
  });
  return bands;
}
