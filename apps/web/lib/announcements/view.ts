import type { Announcement, Media } from "@churchy/contracts";
import { liturgicalDay, type LiturgicalFamily } from "@churchy/calendar";
import {
  addDays,
  formatDateRange,
  formatMonthDay,
  parseIsoDate,
  startOfIsoWeek,
} from "@churchy/hu";
import { firstParam, parseDateParam } from "@/lib/service-schedule/view";

/**
 * View model of the public weekly announcements page (D-14, SDD §7.3): the week heading with the
 * liturgical Sunday name of the tenant's tradition, the URL state (`?het=`, `?nezet=archivum`,
 * `?oldal=`), neighbouring weeks and the archive. Pure: data, "today" and messages are passed in;
 * all dates are Europe/Budapest civil dates, an announcement belongs to the week (Monday–Sunday)
 * that ends on its Sunday.
 */

/** Query parameter of the week (`?het=2026-11-15`, the week's Sunday). */
export const WEEK_PARAM = "het";
/** Query parameter of the view (`?nezet=archivum`). */
export const VIEW_PARAM = "nezet";
export const ARCHIVE_VIEW = "archivum";
/** Query parameter of the archive page (`?oldal=2`). */
export const PAGE_PARAM = "oldal";
/** Archive weeks per page. */
export const ARCHIVE_PAGE_SIZE = 20;

/** Everything a week heading shows, derived from the week's Sunday. */
export interface AnnouncementWeek {
  /** The Sunday the week ends on (`2026-11-15`). */
  sunday: string;
  /** Its Monday (`2026-11-09`). */
  monday: string;
  /** The Sunday's date without weekday: `2026. november 15.` */
  dateLabel: string;
  /** The week as a compact range: `nov. 9–15.` */
  range: string;
  /**
   * What the tradition celebrates on that Sunday (`Évközi 33. vasárnap`, `Krisztus Király`,
   * `Szentháromság ünnepe utáni 24. vasárnap`), or null when the calendar names nothing.
   */
  liturgicalName: string | null;
}

/**
 * The week of an announcement. The liturgical name comes from `@churchy/calendar` for the preset's
 * calendar family, so a Catholic parish and a Reformed congregation name the same Sunday
 * differently. A solemnity that takes the Sunday's place (*Mindenszentek*) is named as such.
 *
 * @throws RangeError when `sunday` is not a valid date.
 */
export function announcementWeek(sunday: string, family: LiturgicalFamily): AnnouncementWeek {
  const { year } = parseIsoDate(sunday);
  const day = liturgicalDay(sunday, family);
  const monday = addDays(sunday, -6);
  return {
    sunday,
    monday,
    dateLabel: `${year}. ${formatMonthDay(sunday, { style: "long" })}`,
    range: formatDateRange(monday, sunday),
    liturgicalName: day.name ?? day.sundayName,
  };
}

/** The two heading messages (`public.announcements.weekHeading*` in messages/hu.json). */
export type HeadingTranslator = (
  key: "weekHeading" | "weekHeadingPlain",
  values: { date: string; day: string },
) => string;

/**
 * The page heading of a week, e.g. `Hirdetések — 2026. november 15. (Évközi 33. vasárnap)`.
 * The wording comes from the messages (term-resolved), the parts from {@link announcementWeek}.
 */
export function announcementHeading(
  sunday: string,
  family: LiturgicalFamily,
  t: HeadingTranslator,
): string {
  const week = announcementWeek(sunday, family);
  const values = { date: week.dateLabel, day: week.liturgicalName ?? "" };
  return t(week.liturgicalName === null ? "weekHeadingPlain" : "weekHeading", values);
}

export type WeekParam =
  | { kind: "none" }
  /** A valid date, as the Sunday of its week; `canonical` is false when the URL said otherwise. */
  | { kind: "week"; sunday: string; canonical: boolean }
  | { kind: "invalid"; raw: string };

/**
 * Reads `?het=`. Any date of a week selects that week (its Sunday); only the Sunday in `YYYY-MM-DD`
 * form is canonical, so the page can redirect every other spelling to one shareable URL.
 */
export function parseWeekParam(raw: string | string[] | undefined): WeekParam {
  const parsed = parseDateParam(raw);
  if (parsed.kind !== "date") return parsed;
  const sunday = addDays(startOfIsoWeek(parsed.date), 6);
  return { kind: "week", sunday, canonical: parsed.canonical && sunday === parsed.date };
}

/** Reads `?oldal=`: a positive integer, else 1. */
export function parsePageParam(raw: string | string[] | undefined): number {
  const value = firstParam(raw);
  if (value === undefined || !/^\d{1,4}$/.test(value)) return 1;
  return Math.max(1, Number(value));
}

/** True when the URL asks for the archive view. */
export function isArchiveView(raw: string | string[] | undefined): boolean {
  return firstParam(raw) === ARCHIVE_VIEW;
}

/** Builds a page URL; the latest week and archive page 1 are the defaults and left out. */
export function announcementsHref(
  basePath: string,
  state: { week?: string | null; archive?: boolean; page?: number } = {},
): string {
  const params = new URLSearchParams();
  if (state.archive) {
    params.set(VIEW_PARAM, ARCHIVE_VIEW);
    if (state.page !== undefined && state.page > 1) params.set(PAGE_PARAM, String(state.page));
  } else if (state.week) {
    params.set(WEEK_PARAM, state.week);
  }
  const query = params.toString();
  return query === "" ? basePath : `${basePath}?${query}`;
}

/** The announcements next to a week, closest first. */
export interface Neighbours {
  /** The closest announcement of an earlier week, or null. */
  older: Announcement | null;
  /** The closest announcement of a later week, or null. */
  newer: Announcement | null;
}

/**
 * Previous / next week for the navigation (`‹ Előző hét | Archívum | Következő hét ›`). Weeks
 * without an announcement are skipped, so the links never lead to an empty page.
 */
export function neighbours(items: readonly Announcement[], sunday: string): Neighbours {
  let older: Announcement | null = null;
  let newer: Announcement | null = null;
  for (const item of items) {
    if (item.weekSunday < sunday && (older === null || item.weekSunday > older.weekSunday)) {
      older = item;
    }
    if (item.weekSunday > sunday && (newer === null || item.weekSunday < newer.weekSunday)) {
      newer = item;
    }
  }
  return { older, newer };
}

/** Archive weeks grouped by the Sunday's year, newest first. */
export function archiveByYear(
  items: readonly Announcement[],
): { year: number; items: Announcement[] }[] {
  const groups: { year: number; items: Announcement[] }[] = [];
  const sorted = [...items].sort((a, b) => b.weekSunday.localeCompare(a.weekSunday));
  for (const item of sorted) {
    const year = parseIsoDate(item.weekSunday).year;
    let group = groups.at(-1);
    if (group?.year !== year) {
      group = { year, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** A downloadable public file: where it is served, its name and its size in kB. */
export interface PublicFile {
  href: string;
  filename: string;
  /** Size in kilobytes, rounded, at least 1 (`47`). */
  kilobytes: number;
}

/**
 * Where a public PDF is served. Phase A only knows the demo placeholders under `public/demo/`;
 * object storage (signed or CDN URLs) arrives with the BE part, until then other files have no link.
 */
export function publicFile(media: Media | null): PublicFile | null {
  if (media === null || media.visibility !== "public" || media.kind !== "pdf") return null;
  if (!/^demo\/[a-z0-9][a-z0-9.-]*$/.test(media.storageKey)) return null;
  return {
    href: `/${media.storageKey}`,
    filename: media.filename,
    kilobytes: Math.max(1, Math.round(media.bytes / 1024)),
  };
}

type RichNode = { type?: unknown; text?: unknown; content?: unknown };

function plainText(node: RichNode): string {
  if (node.type === "text" && typeof node.text === "string") return node.text;
  return Array.isArray(node.content)
    ? node.content.map((child) => plainText(child as RichNode)).join("")
    : "";
}

/**
 * The first `count` lines of an announcement for the home-page teaser: its list items (the
 * individual announcements), or its paragraphs when it has no list. Plain text only.
 */
export function teaserLines(body: Announcement["body"], count: number): string[] {
  if (body === null) return [];
  const items: string[] = [];
  const paragraphs: string[] = [];
  const visit = (node: RichNode, inList: boolean) => {
    if (node === null || typeof node !== "object") return;
    if (node.type === "listItem") {
      const line = plainText(node).trim();
      if (line !== "") items.push(line);
      return;
    }
    if (node.type === "paragraph" && !inList) {
      const line = plainText(node).trim();
      if (line !== "") paragraphs.push(line);
      return;
    }
    if (Array.isArray(node.content)) {
      const list = inList || node.type === "bulletList" || node.type === "orderedList";
      for (const child of node.content) visit(child as RichNode, list);
    }
  };
  for (const node of body.content) visit(node as RichNode, false);
  return (items.length > 0 ? items : paragraphs).slice(0, Math.max(0, count));
}
