import type { I18n } from "@/i18n/music/i18n";

// Short summaries for lists. For a duration, use `i18n.duration()`.

/**
 * The display name, or the email for users without one. "Member" when the
 * viewer does not get the email (null, see `listPeople()`), "No email" when
 * the user has none. Pass the `i18n`, so the label is in the language of the
 * page. Not in `user-avatar.tsx`: a Server Component cannot call a function
 * from a "use client" module.
 */
export function personName(
  person: { displayName: string | null; email: string | null },
  i18n: I18n,
): string {
  if (person.displayName !== null) return person.displayName;
  if (person.email === null) return i18n.m.common.people.member;
  return person.email || i18n.m.common.account.noEmail;
}

/** A duration in seconds as minutes and seconds, e.g. "4:05", or "75:00" for 75 minutes. */
export function formatMinutesSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** For example "1 song" or "12 songs". */
export function formatSongCount({ m, plural }: I18n, count: number): string {
  return plural(m.common.counts.songs, count);
}

/** For example "1 item" or "12 items". */
export function formatItemCount({ m, plural }: I18n, count: number): string {
  return plural(m.common.counts.items, count);
}

/** For example "5 songs", "1 text item" or "5 songs · 2 text items". */
export function formatEventItems(i18n: I18n, songCount: number, itemCount: number): string {
  const { m, plural } = i18n;
  const textCount = itemCount - songCount;
  const parts: string[] = [];
  if (songCount > 0) parts.push(formatSongCount(i18n, songCount));
  if (textCount > 0) parts.push(plural(m.common.counts.textItems, textCount));
  return parts.join(m.common.separator);
}
