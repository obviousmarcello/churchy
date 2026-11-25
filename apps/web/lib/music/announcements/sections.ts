import { addDays, churchDay, endOfMonth, startOfNextMonth, type DayKey } from "../church-time";
import {
  calendarEntryKey,
  DEFAULT_ENTRY_SETTINGS,
  type AnnouncementDTO,
  type EntrySettings,
  type ManualFields,
  type SectionId,
  type WeekGroupId,
} from "./schema";

// The entries of an announcements item in its sections, from the day of the
// event (in the time zone of the church):
// - "Next week": the day of the event and the 7 days after it. On the day of
//   the event, only the entries that end after its start. The entries that
//   started before and did not end are here too.
// - "Later this month": the days after it, to the end of the month.
// - "Next month": the whole next month, without the days of "Next week".
// Each entry is in one section, by the day of its start. "Next week" has
// three groups, also by the day of the start: the day of the event, the 6
// days after it, and the same day of the next week (see `weekGroups`). An
// excluded entry (by its admin, or by a word of its title) is in no section.
// A highlighted entry, and an entry with an attachment or a QR code, has its
// own slides after the sections, in the order of the sections; then the
// manual entries without a date, which have only their own slides.

export type DetailFlags = { time: boolean; location: boolean; description: boolean };

export type ViewEntry = {
  /** The calendar entry (see `calendarEntryKey`), or `manual:<id>`. */
  key: string;
  source: "calendar" | "manual";
  /** The row of its settings, or of the manual entry. Null: a calendar entry without settings. */
  entryId: string | null;
  calendarId: string | null;
  title: string;
  allDay: boolean;
  /** A day (all day) or an ISO time. Null: a manual entry without a date. */
  start: string | null;
  end: string | null;
  startDay: DayKey | null;
  endDay: DayKey | null;
  location: string | null;
  description: string | null;
  /** A web address for its QR code, from the calendar. */
  url: string | null;
  settings: EntrySettings;
  /** The details in the lists. */
  show: DetailFlags;
  /** The details on its own slides: all but those that the entry hides. */
  ownShow: DetailFlags;
  /** In the accent color in the lists, and with its own slides. */
  highlighted: boolean;
  /** Why it is in no section. Null: it is not excluded. */
  excludedBy: "entry" | "word" | null;
};

export type ViewSection = { id: SectionId; from: DayKey; to: DayKey; entries: ViewEntry[] };

export type ViewGroup = { id: WeekGroupId; from: DayKey; to: DayKey; entries: ViewEntry[] };

/**
 * The entries of the section "Next week" in its groups: the day of the event
 * (also the entries that started before it), the 6 days after it, and the
 * day 7 days after it. All three, also the empty ones.
 */
export function weekGroups(section: ViewSection): ViewGroup[] {
  const day = section.from;
  const groups: ViewGroup[] = [
    { id: "eventDay", from: day, to: day, entries: [] },
    { id: "restOfWeek", from: addDays(day, 1), to: addDays(day, 6), entries: [] },
    { id: "nextEventDay", from: addDays(day, 7), to: addDays(day, 7), entries: [] },
  ];
  for (const entry of section.entries) {
    const startDay = entry.startDay as DayKey;
    const group = groups.find((g) => startDay <= g.to) ?? groups[2];
    group?.entries.push(entry);
  }
  return groups;
}

/**
 * `qrSide`: the side of the QR code next to the images of the attachment:
 * "end" (right, or bottom on a portrait screen) or "start". Null without
 * a QR code or without images.
 */
export type OwnEntry = ViewEntry & { qrSide: "start" | "end" | null };

export type AnnouncementView = {
  eventDay: DayKey;
  /** All three, also the empty ones. */
  sections: ViewSection[];
  /** The entries with their own slides, in order. */
  own: OwnEntry[];
  /** The manual entries without a date, in order. */
  undated: ViewEntry[];
  /** The entries of the sections that are excluded, in order. */
  excluded: ViewEntry[];
};

/** Whether a word of `words` is in the title, without case. */
export function excludedByWord(title: string, words: readonly string[]): boolean {
  const lower = title.toLocaleLowerCase();
  return words.some((word) => word && lower.includes(word.toLocaleLowerCase()));
}

function resolve(
  settings: EntrySettings,
  announcement: Pick<AnnouncementDTO, "showTime" | "showLocation" | "showDescription">,
) {
  return {
    show: {
      time: settings.showTime ?? announcement.showTime,
      location: settings.showLocation ?? announcement.showLocation,
      description: settings.showDescription ?? announcement.showDescription,
    },
    ownShow: {
      time: settings.showTime !== false,
      location: settings.showLocation !== false,
      description: settings.showDescription !== false,
    },
  };
}

function hasOwnSlides(settings: EntrySettings): boolean {
  return settings.highlighted || settings.attachmentSetId !== null || settings.qrText !== null;
}

function manualTimes(
  fields: ManualFields,
): Pick<ViewEntry, "allDay" | "start" | "end" | "startDay" | "endDay"> {
  if (fields.startsAt) {
    return {
      allDay: false,
      start: fields.startsAt,
      end: fields.endsAt,
      startDay: churchDay(fields.startsAt),
      endDay: churchDay(fields.endsAt ?? fields.startsAt),
    };
  }
  if (fields.startDate) {
    return {
      allDay: true,
      start: fields.startDate,
      end: fields.endDate,
      startDay: fields.startDate,
      endDay: fields.endDate ?? fields.startDate,
    };
  }
  return { allDay: false, start: null, end: null, startDay: null, endDay: null };
}

/** For the order in a section: by day, the entries of all day first, then by time and title. */
function compareEntries(a: ViewEntry, b: ViewEntry): number {
  return (
    (a.startDay ?? "").localeCompare(b.startDay ?? "") ||
    Number(a.allDay ? 0 : 1) - Number(b.allDay ? 0 : 1) ||
    (a.allDay ? 0 : Date.parse(a.start ?? "") - Date.parse(b.start ?? "")) ||
    a.title.localeCompare(b.title)
  );
}

/**
 * The view of an announcement for an event that starts at `eventStartsAt`.
 * `calendarIds`: the calendars whose entries count, e.g. without a calendar
 * that a superadmin turned off since the last read. `excludeWords`: the
 * words that exclude an entry by its title.
 */
export function buildAnnouncementView({
  announcement,
  eventStartsAt,
  calendarIds,
  excludeWords,
}: {
  announcement: Pick<
    AnnouncementDTO,
    "snapshot" | "entries" | "showTime" | "showLocation" | "showDescription"
  >;
  eventStartsAt: string;
  calendarIds: ReadonlySet<string> | null;
  excludeWords: readonly string[];
}): AnnouncementView {
  const eventDay = churchDay(eventStartsAt);
  const eventStart = Date.parse(eventStartsAt);
  const nextWeekEnd = addDays(eventDay, 7);
  const monthEnd = endOfMonth(eventDay);
  const nextMonthStart = startOfNextMonth(eventDay);
  const nextMonthEnd = endOfMonth(nextMonthStart);
  const sections: ViewSection[] = [
    { id: "nextWeek", from: eventDay, to: nextWeekEnd, entries: [] },
    { id: "thisMonth", from: addDays(nextWeekEnd, 1), to: monthEnd, entries: [] },
    {
      id: "nextMonth",
      from: nextWeekEnd >= nextMonthStart ? addDays(nextWeekEnd, 1) : nextMonthStart,
      to: nextMonthEnd,
      entries: [],
    },
  ];

  const settingsByKey = new Map<string, { id: string; settings: EntrySettings }>();
  const entries: ViewEntry[] = [];
  const undated: { entry: ViewEntry; position: number }[] = [];

  for (const row of announcement.entries) {
    const settings: EntrySettings = {
      highlighted: row.highlighted,
      excluded: row.excluded,
      showTime: row.showTime,
      showLocation: row.showLocation,
      showDescription: row.showDescription,
      attachmentSetId: row.attachmentSetId,
      qrText: row.qrText,
      qrCaption: row.qrCaption,
      textFirst: row.textFirst,
    };
    if (row.source === "calendar") {
      settingsByKey.set(calendarEntryKey(row), { id: row.id, settings });
      continue;
    }
    const times = manualTimes(row);
    const entry: ViewEntry = {
      key: `manual:${row.id}`,
      source: "manual",
      entryId: row.id,
      calendarId: null,
      title: row.title,
      ...times,
      location: row.location,
      description: row.description,
      url: null,
      settings,
      ...resolve(settings, announcement),
      highlighted: times.start === null || hasOwnSlides(settings),
      excludedBy: settings.excluded ? "entry" : null,
    };
    if (times.start === null) undated.push({ entry, position: row.position });
    else entries.push(entry);
  }

  for (const calendarEntry of announcement.snapshot) {
    if (calendarIds && !calendarIds.has(calendarEntry.calendarId)) continue;
    const key = calendarEntryKey(calendarEntry);
    const saved = settingsByKey.get(key);
    const settings = saved?.settings ?? DEFAULT_ENTRY_SETTINGS;
    const allDay = calendarEntry.allDay;
    entries.push({
      key,
      source: "calendar",
      entryId: saved?.id ?? null,
      calendarId: calendarEntry.calendarId,
      title: calendarEntry.title,
      allDay,
      start: calendarEntry.start,
      end: calendarEntry.end,
      startDay: allDay ? calendarEntry.start : churchDay(calendarEntry.start),
      endDay: allDay
        ? (calendarEntry.end ?? calendarEntry.start)
        : churchDay(calendarEntry.end ?? calendarEntry.start),
      location: calendarEntry.location,
      description: calendarEntry.description,
      url: calendarEntry.url,
      settings,
      ...resolve(settings, announcement),
      highlighted: hasOwnSlides(settings),
      excludedBy: settings.excluded
        ? "entry"
        : excludedByWord(calendarEntry.title, excludeWords)
          ? "word"
          : null,
    });
  }

  const excluded: ViewEntry[] = [];
  for (const entry of entries.sort(compareEntries)) {
    const startDay = entry.startDay as DayKey;
    const endDay = entry.endDay as DayKey;
    if (endDay < eventDay) continue;
    // On the day of the event: only what ends after its start.
    if (!entry.allDay && Date.parse(entry.end ?? (entry.start as string)) <= eventStart) continue;
    const section = sections.find(
      (s) => startDay <= s.to && (s.id === "nextWeek" || startDay >= s.from),
    );
    if (!section) continue;
    if (entry.excludedBy) excluded.push(entry);
    else section.entries.push(entry);
  }

  const undatedEntries = undated.sort((a, b) => a.position - b.position).map(({ entry }) => entry);
  const own: OwnEntry[] = [];
  let previous: OwnEntry | null = null;
  for (const entry of [
    ...sections.flatMap((section) => section.entries.filter((e) => e.highlighted)),
    ...undatedEntries,
  ]) {
    const split = entry.settings.qrText !== null && entry.settings.attachmentSetId !== null;
    // The side changes from one QR code to the next one right after it.
    const qrSide: OwnEntry["qrSide"] = !split ? null : previous?.qrSide === "end" ? "start" : "end";
    const ownEntry: OwnEntry = { ...entry, qrSide };
    own.push(ownEntry);
    previous = ownEntry;
  }

  return { eventDay, sections, own, undated: undatedEntries, excluded };
}
