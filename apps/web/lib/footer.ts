import type { OpeningHours, SiteConfig } from "@churchy/contracts";
import { weeklyTable, type TimeInterval } from "@churchy/schedule";

/**
 * Site footer data (FR-109, D-17): the office-hours summary and the social links. Pure, so it is
 * unit tested; `components/public/site-footer.tsx` renders it.
 */

/** Paths of the legal pages (SDD §6). */
export const LEGAL_PATHS = { impresszum: "/impresszum", privacy: "/adatkezeles" } as const;

export interface HoursGroup {
  /** First and last ISO weekday (1 = Monday) of a run of days with the same hours. */
  from: number;
  to: number;
  intervals: TimeInterval[];
}

/** Any fixed instant: the weekly table's "today" flag is not used here. */
const LAYOUT_INSTANT = Date.UTC(2026, 0, 5);

const sameIntervals = (a: TimeInterval[], b: TimeInterval[]) =>
  a.length === b.length && a.every((i, n) => i.from === b[n]!.from && i.to === b[n]!.to);

/**
 * The regular weekly office hours as runs of consecutive days with identical hours (Monday
 * first), closed days left out: `Hétfő–Péntek: 9:00–12:00`, `Szerda: 15:00–17:00`. Exceptions are
 * shown on the contact page, which the footer links to.
 */
export function officeHoursSummary(hours: Pick<OpeningHours, "weekly">): HoursGroup[] {
  const groups: HoursGroup[] = [];
  for (const row of weeklyTable(hours, LAYOUT_INSTANT)) {
    if (row.intervals.length === 0) continue;
    const last = groups.at(-1);
    if (last && last.to === row.weekday - 1 && sameIntervals(last.intervals, row.intervals)) {
      last.to = row.weekday;
    } else {
      groups.push({ from: row.weekday, to: row.weekday, intervals: row.intervals });
    }
  }
  return groups;
}

export type SocialNetwork = "facebook" | "youtube" | "instagram";

export interface SocialLink {
  network: SocialNetwork;
  href: string;
}

/** Social profile links of the church, in a fixed order; only `https:` URLs are linked. */
export function socialLinks(integrations: Partial<SiteConfig["integrations"]>): SocialLink[] {
  const candidates: [SocialNetwork, string | undefined][] = [
    ["facebook", integrations.facebookUrl],
    ["youtube", integrations.youtubeChannelUrl],
    ["instagram", integrations.instagramUrl],
  ];
  return candidates.flatMap(([network, href]) =>
    href && /^https:\/\//.test(href) ? [{ network, href }] : [],
  );
}
