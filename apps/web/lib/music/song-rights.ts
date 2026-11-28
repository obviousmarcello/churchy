// The rights of a song. Keep the limits and the statuses in sync with the migration `song_rights`.

/** The most characters of a song's authors text. */
export const SONG_AUTHORS_MAX_LENGTH = 500;
/** The most characters of the original title of a translated song. */
export const SONG_ORIGINAL_TITLE_MAX_LENGTH = 200;
/** The most characters of the translator of a song. */
export const SONG_TRANSLATOR_MAX_LENGTH = 200;
/** The most characters of the source of the permission. */
export const SONG_RIGHTS_NOTE_MAX_LENGTH = 500;

/** For a translation, the status of the weaker side: the translator or the original publisher. */
export const SONG_RIGHTS_STATUSES = [
  "public_domain",
  "licensed",
  "permitted",
  "partial",
  "unknown",
] as const;

export type SongRightsStatus = (typeof SONG_RIGHTS_STATUSES)[number];

/** No data yet. */
export const DEFAULT_SONG_RIGHTS_STATUS: SongRightsStatus = "unknown";
