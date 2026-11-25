import { z } from "zod";

// The data of an announcements item, on the server and in the browser (see
// the migration `announcements`).

/** The longest texts, as in the database. */
export const ANNOUNCEMENT_LIMITS = {
  title: 200,
  location: 500,
  description: 2000,
  qrText: 500,
  qrCaption: 200,
  sectionTitle: 100,
  calendarName: 100,
  calendarUrl: 2000,
  excludeWord: 50,
  excludeWords: 50,
  /** The entries of one snapshot: a calendar with many entries keeps the first ones. */
  snapshotEntries: 500,
  /** The manual entries of an announcement. */
  manualEntries: 100,
};

/** `occurrence` of a calendar entry that does not repeat. */
export const SINGLE_OCCURRENCE = "single";

/**
 * An entry of a calendar in the snapshot. An entry of all day has days
 * (`YYYY-MM-DD`; `end` is its last day), else ISO times in UTC. `url`: the
 * first web address in the description, for a QR code.
 */
export const calendarEntrySchema = z.object({
  calendarId: z.uuid(),
  uid: z.string().min(1).max(1000),
  occurrence: z.string().min(1).max(40),
  title: z.string().max(ANNOUNCEMENT_LIMITS.title),
  start: z.string().max(40),
  end: z.string().max(40).nullable(),
  allDay: z.boolean(),
  location: z.string().max(ANNOUNCEMENT_LIMITS.location).nullable(),
  description: z.string().max(ANNOUNCEMENT_LIMITS.description).nullable(),
  url: z.string().max(ANNOUNCEMENT_LIMITS.qrText).nullable(),
});

export type CalendarEntry = z.infer<typeof calendarEntrySchema>;

/** Each entry that is valid; a bad one is left out. */
export function parseSnapshot(value: unknown): CalendarEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const result = calendarEntrySchema.safeParse(entry);
    return result.success ? [result.data] : [];
  });
}

export const calendarStatusSchema = z.record(
  z.string(),
  z.object({
    refreshedAt: z.string().optional(),
    failedAt: z.string().optional(),
    error: z.string().max(200).optional(),
  }),
);

/** The last good read and the last error of each calendar, by its id. */
export type CalendarStatus = z.infer<typeof calendarStatusSchema>;

/** A detail of an entry: the setting of the announcement (null), or shown or hidden. */
export type DetailOverride = boolean | null;

export type EntrySettings = {
  highlighted: boolean;
  excluded: boolean;
  showTime: DetailOverride;
  showLocation: DetailOverride;
  showDescription: DetailOverride;
  attachmentSetId: string | null;
  qrText: string | null;
  qrCaption: string | null;
  /** The text slide before the images of the attachment. */
  textFirst: boolean;
};

export const DEFAULT_ENTRY_SETTINGS: EntrySettings = {
  highlighted: false,
  excluded: false,
  showTime: null,
  showLocation: null,
  showDescription: null,
  attachmentSetId: null,
  qrText: null,
  qrCaption: null,
  textFirst: false,
};

/** The fields of a manual entry. A timed entry has `startsAt`, an entry of all day `startDate`, an entry without a date none. */
export type ManualFields = {
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  description: string | null;
  position: number;
};

export type AnnouncementEntryDTO = { id: string } & EntrySettings &
  (
    | { source: "calendar"; calendarId: string; uid: string; occurrence: string }
    | ({ source: "manual" } & ManualFields)
  );

export type SectionId = "nextWeek" | "thisMonth" | "nextMonth";

export const SECTION_IDS: SectionId[] = ["nextWeek", "thisMonth", "nextMonth"];

/** The groups of the section "Next week": the day of the event, the 6 days after it, and the day 7 days after it. */
export type WeekGroupId = "eventDay" | "restOfWeek" | "nextEventDay";

export type AnnouncementSettings = {
  /** Null: all calendars that are on. */
  calendarIds: string[] | null;
  showTime: boolean;
  showLocation: boolean;
  showDescription: boolean;
  /** Null: the title in the language of the page. */
  titles: Record<SectionId, string | null>;
};

export type AnnouncementDTO = AnnouncementSettings & {
  id: string;
  eventId: string;
  snapshot: CalendarEntry[];
  calendarStatus: CalendarStatus;
  refreshedAt: string | null;
  entries: AnnouncementEntryDTO[];
};

/** A calendar for the admins of the events: without its address. */
export type CalendarOption = { id: string; name: string; enabled: boolean };

/** The announcements of an event by their id, with the calendars and the exclude words that their views need. */
export type EventAnnouncementsDTO = {
  announcements: Record<string, AnnouncementDTO>;
  calendars: CalendarOption[];
  excludeWords: string[];
};

/** The calendars whose entries an announcement shows: its own choice, or all, and only those that are on. */
export function activeCalendarIds(
  announcement: Pick<AnnouncementSettings, "calendarIds">,
  calendars: CalendarOption[],
): Set<string> {
  const chosen = announcement.calendarIds && new Set(announcement.calendarIds);
  return new Set(
    calendars
      .filter((calendar) => calendar.enabled && (!chosen || chosen.has(calendar.id)))
      .map((calendar) => calendar.id),
  );
}

/** The key of an entry in a view: the settings of a calendar entry go with it. */
export function calendarEntryKey(entry: {
  calendarId: string;
  uid: string;
  occurrence: string;
}): string {
  return JSON.stringify([entry.calendarId, entry.uid, entry.occurrence]);
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable();

// A web address, or any short text.
const qrTextSchema = z
  .string()
  .trim()
  .max(ANNOUNCEMENT_LIMITS.qrText)
  .transform((value) => value || null)
  .nullable();

/** What the editor changes of an entry; the keys that it leaves out stay. */
export const entrySettingsInputSchema = z.strictObject({
  highlighted: z.boolean().optional(),
  excluded: z.boolean().optional(),
  showTime: z.boolean().nullable().optional(),
  showLocation: z.boolean().nullable().optional(),
  showDescription: z.boolean().nullable().optional(),
  qrText: qrTextSchema.optional(),
  qrCaption: optionalText(ANNOUNCEMENT_LIMITS.qrCaption).optional(),
  textFirst: z.boolean().optional(),
});

export type EntrySettingsInput = z.input<typeof entrySettingsInputSchema>;

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A manual entry from the editor. */
export const manualEntryInputSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(ANNOUNCEMENT_LIMITS.title),
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    startDate: dayString.nullable(),
    endDate: dayString.nullable(),
    location: optionalText(ANNOUNCEMENT_LIMITS.location),
    description: optionalText(ANNOUNCEMENT_LIMITS.description),
  })
  .refine((entry) => !(entry.startsAt && entry.startDate), { path: ["startDate"] })
  .refine(
    (entry) =>
      !entry.endsAt ||
      (entry.startsAt !== null && Date.parse(entry.endsAt) >= Date.parse(entry.startsAt)),
    {
      path: ["endsAt"],
    },
  )
  .refine(
    (entry) => !entry.endDate || (entry.startDate !== null && entry.endDate >= entry.startDate),
    { path: ["endDate"] },
  );

export type ManualEntryInput = z.input<typeof manualEntryInputSchema>;

/** The settings of an announcement from the editor; the keys that it leaves out stay. */
export const announcementSettingsInputSchema = z.strictObject({
  calendarIds: z.array(z.uuid()).max(50).nullable().optional(),
  showTime: z.boolean().optional(),
  showLocation: z.boolean().optional(),
  showDescription: z.boolean().optional(),
  titles: z
    .strictObject({
      nextWeek: optionalText(ANNOUNCEMENT_LIMITS.sectionTitle).optional(),
      thisMonth: optionalText(ANNOUNCEMENT_LIMITS.sectionTitle).optional(),
      nextMonth: optionalText(ANNOUNCEMENT_LIMITS.sectionTitle).optional(),
    })
    .optional(),
});

export type AnnouncementSettingsInput = z.input<typeof announcementSettingsInputSchema>;
