import type { I18n } from "@/i18n/music/i18n";
import { churchTimeZone, type DayKey } from "@/lib/music/church-time";
import type { EventImageDTO } from "@/lib/music/projection/images";
import type {
  AnnouncementLine,
  AnnouncementSection,
  AnnouncementSlides,
  ProjectionSource,
} from "@/lib/music/projection/slides";
import type { SectionId, WeekGroupId } from "./schema";
import { weekGroups, type AnnouncementView, type DetailFlags, type ViewEntry } from "./sections";

// The texts of an announcements item for the projection, in the language of
// the page and in the time zone of the church: the days and times of the
// entries, and the days of the sections and of their groups.

/** A day at noon UTC: its date is the same in every time zone near UTC. */
function noon(day: DayKey): Date {
  return new Date(`${day}T12:00:00Z`);
}

const DAY_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};
const RANGE_OPTIONS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
const TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

function dayFormat(locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
}

/** "Sun, Nov 1" or "Fri, Oct 30 – Sun, Nov 1", e.g. the days of a group of "Next week". */
export function formatDays(locale: string, start: DayKey, end: DayKey | null): string {
  const format = dayFormat(locale, DAY_OPTIONS);
  return end && end !== start
    ? format.formatRange(noon(start), noon(end))
    : format.format(noon(start));
}

/**
 * When an entry is: its days, and with `withTime` its time, e.g.
 * "Sun, Nov 1, 6:00 – 8:00 PM". Null for an entry without a date.
 */
export function formatWhen(entry: ViewEntry, withTime: boolean, locale: string): string | null {
  if (entry.start === null || entry.startDay === null) return null;
  if (entry.allDay || !withTime) return formatDays(locale, entry.startDay, entry.endDay);
  const format = new Intl.DateTimeFormat(locale, {
    ...DAY_OPTIONS,
    ...TIME_OPTIONS,
    timeZone: churchTimeZone(),
  });
  const start = new Date(entry.start);
  return entry.end ? format.formatRange(start, new Date(entry.end)) : format.format(start);
}

/** The days of a section, e.g. "Oct 25 – Nov 1". */
export function formatRange(locale: string, from: DayKey, to: DayKey): string {
  return dayFormat(locale, RANGE_OPTIONS).formatRange(noon(from), noon(to));
}

/**
 * The heading of each group of "Next week" from its text, e.g. "Next
 * {weekday}": `{weekday}` is the weekday of the event, e.g. "Sunday".
 */
export function groupHeadings(
  texts: Record<WeekGroupId, string>,
  eventDay: DayKey,
  { locale, format }: Pick<I18n, "locale" | "format">,
): Record<WeekGroupId, string> {
  const weekday = dayFormat(locale, { weekday: "long" }).format(noon(eventDay));
  return {
    eventDay: format(texts.eventDay, { weekday }),
    restOfWeek: format(texts.restOfWeek, { weekday }),
    nextEventDay: format(texts.nextEventDay, { weekday }),
  };
}

function details(entry: ViewEntry, show: DetailFlags): string[] {
  return [
    show.location ? entry.location : null,
    show.description ? entry.description : null,
  ].filter((text) => text !== null);
}

/** A short id of the key of an entry, the same on each controller: the hash FNV-1a in 8 hexadecimal digits. */
export function shortId(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The list line of an entry. */
export function announcementLine(entry: ViewEntry, locale: string): AnnouncementLine {
  return {
    when: formatWhen(entry, entry.show.time, locale) ?? "",
    title: entry.title,
    details: details(entry, entry.show),
    accent: entry.highlighted,
  };
}

/**
 * The source of an announcements item for the projection. `titles`: the
 * title of each section. `groupTitles`: the heading of each group of "Next
 * week" (see `groupHeadings`). `images`: the images of the sets of the event.
 * When the entries of "Next week" are in two groups or more, its list is an
 * overview without the details, and each group with entries has its own list.
 */
export function announcementSource({
  key,
  title,
  themeId,
  view,
  titles,
  groupTitles,
  images,
  locale,
}: {
  key: string;
  title: string;
  themeId?: string | null;
  view: AnnouncementView;
  titles: Record<SectionId, string>;
  groupTitles: Record<WeekGroupId, string>;
  images: Readonly<Record<string, EventImageDTO[]>>;
  locale: string;
}): Extract<ProjectionSource, { kind: "announcements" }> {
  const sections = view.sections
    .filter((section) => section.entries.length > 0)
    .map((section): AnnouncementSection => {
      const heading = titles[section.id];
      const range = formatRange(locale, section.from, section.to);
      const groups =
        section.id === "nextWeek"
          ? weekGroups(section).filter((group) => group.entries.length > 0)
          : [];
      if (groups.length < 2) {
        return {
          id: section.id,
          heading,
          range,
          entries: section.entries.map((entry) => announcementLine(entry, locale)),
        };
      }
      return {
        id: section.id,
        heading,
        range,
        entries: section.entries.map((entry) => ({
          ...announcementLine(entry, locale),
          details: [],
        })),
        groups: groups.map((group) => ({
          id: group.id,
          heading: groupTitles[group.id],
          range: formatDays(locale, group.from, group.to),
          entries: group.entries.map((entry) => announcementLine(entry, locale)),
        })),
      };
    });
  const own = view.own.map((entry): AnnouncementSlides => ({
    id: shortId(entry.key),
    title: entry.title,
    when: formatWhen(entry, entry.ownShow.time, locale),
    details: details(entry, entry.ownShow),
    imageSetId: entry.settings.attachmentSetId,
    images: entry.settings.attachmentSetId ? (images[entry.settings.attachmentSetId] ?? []) : [],
    qr: entry.settings.qrText
      ? { text: entry.settings.qrText, caption: entry.settings.qrCaption }
      : null,
    qrSide: entry.qrSide,
    textFirst: entry.settings.textFirst,
  }));
  return { kind: "announcements", key, title, themeId, sections, own };
}
