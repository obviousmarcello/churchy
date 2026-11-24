// The tags of a song, e.g. "Christmas" or "Communion". Users write them, so
// the app does not translate them. Keep the limits in sync with
// `valid_song_tags()` in the `20261028120000_song_tags` migration.

export const SONG_TAGS_MAX = 10;
export const SONG_TAG_MAX_LENGTH = 40;

/** Tags that differ only in case are the same tag, as `lower()` in the database. */
export function tagKey(tag: string): string {
  return tag.toLowerCase();
}

/**
 * The tags trimmed, with one space between words. Empty tags go, and of
 * tags that differ only in case the first one stays.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const clean = tag.trim().replace(/\s+/g, " ");
    if (!clean || seen.has(tagKey(clean))) continue;
    seen.add(tagKey(clean));
    result.push(clean);
  }
  return result;
}
