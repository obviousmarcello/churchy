import "server-only";

import { z } from "zod";

import { ANNOUNCEMENT_LIMITS, type CalendarOption } from "@/lib/music/announcements/schema";
import { requireEventAdmin, requireAnnouncementAdmin } from "@/server/music/auth";
import { ConflictError } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { databaseError, idSchema, isId, parseInput, requiredText } from "./shared";

// The calendars of the announcements (see the migration `announcements`): the
// superadmins add them by the ICS address, e.g. the secret address of a Google
// calendar, and turn them on or off. The address is secret: no function here
// sends it to a browser, only a hint of it. The words that exclude a calendar
// entry by its title are here too.

/** A calendar for the settings page: a hint of its address, not the address. */
export type CalendarSettingsDTO = CalendarOption & { urlHint: string };

export type AnnouncementCalendarsDTO = { calendars: CalendarSettingsDTO[]; excludeWords: string[] };

/** The most calendars. */
export const ANNOUNCEMENT_CALENDARS_MAX = 20;

const urlSchema = z
  .string()
  .trim()
  .max(ANNOUNCEMENT_LIMITS.calendarUrl)
  .regex(/^https:\/\/\S+$/)
  .refine((value) => URL.canParse(value));

const calendarInputSchema = z.strictObject({
  name: requiredText(ANNOUNCEMENT_LIMITS.calendarName),
  // Empty for a calendar that keeps its address.
  url: z.union([z.literal(""), urlSchema]),
  enabled: z.boolean(),
});

export type CalendarInput = z.input<typeof calendarInputSchema>;

const excludeWordsSchema = z
  .array(z.string().trim().min(1).max(ANNOUNCEMENT_LIMITS.excludeWord))
  .max(ANNOUNCEMENT_LIMITS.excludeWords)
  .transform((words) => [...new Set(words)]);

const calendarRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  ics_url: z.string(),
  enabled: z.boolean(),
  position: z.number().int(),
});

/** The host and the last part of the path, e.g. "calendar.google.com/…/basic.ics". */
export function urlHint(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).at(-1);
    return last
      ? `${parsed.host}/…/${last.length > 30 ? `…${last.slice(-12)}` : last}`
      : parsed.host;
  } catch {
    return "…";
  }
}

async function readRows(): Promise<z.infer<typeof calendarRowSchema>[]> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("announcement_calendars")
    .select("id, name, ics_url, enabled, position")
    .order("position");
  if (error) throw databaseError("list announcement calendars", error);
  return z.array(calendarRowSchema).parse(data);
}

/** The calendars and the exclude words, for the settings page. */
export async function getAnnouncementCalendars(): Promise<AnnouncementCalendarsDTO> {
  await requireAnnouncementAdmin();
  const [rows, excludeWords] = await Promise.all([readRows(), readExcludeWords()]);
  return {
    calendars: rows.map(({ id, name, ics_url, enabled }) => ({
      id,
      name,
      enabled,
      urlHint: urlHint(ics_url),
    })),
    excludeWords,
  };
}

/** The calendars without their addresses, for the editor of an announcements item. */
export async function listCalendarOptions(): Promise<CalendarOption[]> {
  await requireEventAdmin();
  return readCalendarOptions();
}

/** The calendars without their addresses. It does not check the session: the caller does. */
export async function readCalendarOptions(): Promise<CalendarOption[]> {
  return (await readRows()).map(({ id, name, enabled }) => ({ id, name, enabled }));
}

/** The calendars with their addresses, for a read on the server. It does not check the session. */
export async function readCalendarSources(): Promise<
  { id: string; url: string; enabled: boolean }[]
> {
  return (await readRows()).map(({ id, ics_url, enabled }) => ({ id, url: ics_url, enabled }));
}

/** The words that exclude a calendar entry by its title. It does not check the session. */
export async function readExcludeWords(): Promise<string[]> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("announcement_settings")
    .select("exclude_words")
    .maybeSingle();
  if (error) throw databaseError("get announcement settings", error);
  return data ? z.object({ exclude_words: z.array(z.string()) }).parse(data).exclude_words : [];
}

/** Adds a calendar (without `id`) or changes one. A new calendar needs an address. Returns false if there is no such calendar. */
export async function saveAnnouncementCalendar(
  id: string | null,
  input: unknown,
): Promise<boolean> {
  await requireAnnouncementAdmin();
  const calendar = parseInput(calendarInputSchema, input);
  if (id === null) {
    if (!calendar.url)
      throw new ConflictError(({ m }) => m.server.announcements.calendarUrlMissing);
    const rows = await readRows();
    if (rows.length >= ANNOUNCEMENT_CALENDARS_MAX) {
      throw new ConflictError(({ m, format }) =>
        format(m.server.announcements.tooManyCalendars, { max: ANNOUNCEMENT_CALENDARS_MAX }),
      );
    }
    const position = rows.reduce((max, row) => Math.max(max, row.position + 1), 0);
    const { error } = await (
      await getMusicSupabase()
    )
      .from("announcement_calendars")
      .insert({ name: calendar.name, ics_url: calendar.url, enabled: calendar.enabled, position });
    if (error) throw databaseError("add announcement calendar", error);
    return true;
  }
  if (!isId(id)) return false;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("announcement_calendars")
    .update({
      name: calendar.name,
      enabled: calendar.enabled,
      ...(calendar.url && { ics_url: calendar.url }),
    })
    .eq("id", id)
    .select("id");
  if (error) throw databaseError("update announcement calendar", error);
  return data.length > 0;
}

/** Removes a calendar, with the settings of its entries. A trigger removes its entries from all the announcements. */
export async function removeAnnouncementCalendar(id: string): Promise<boolean> {
  await requireAnnouncementAdmin();
  if (!isId(id)) return false;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("announcement_calendars")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw databaseError("remove announcement calendar", error);
  return data.length > 0;
}

/** Moves a calendar one place up (-1) or down (1). */
export async function moveAnnouncementCalendar(id: string, direction: unknown): Promise<boolean> {
  await requireAnnouncementAdmin();
  const step = parseInput(z.union([z.literal(-1), z.literal(1)]), direction);
  const calendarId = parseInput(idSchema, id);
  const rows = await readRows();
  const index = rows.findIndex((row) => row.id === calendarId);
  if (index < 0) return false;
  const other = rows[index + step];
  if (!other) return true;
  // In one statement: the positions are unique.
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("swap_announcement_calendars", { p_id: calendarId, p_other_id: other.id });
  if (error) throw databaseError("move announcement calendar", error);
  return data === true;
}

/** Saves the words that exclude a calendar entry by its title. */
export async function saveExcludeWords(input: unknown): Promise<boolean> {
  const user = await requireAnnouncementAdmin();
  const words = parseInput(excludeWordsSchema, input);
  const { error } = await (
    await getMusicSupabase()
  )
    .from("announcement_settings")
    .upsert({ id: true, exclude_words: words, updated_by: user.id }, { onConflict: "id" });
  if (error) throw databaseError("save announcement settings", error);
  return true;
}
