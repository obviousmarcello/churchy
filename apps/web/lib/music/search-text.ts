// The letters that have no accent to remove, but that `unaccent` in the
// database changes: "Łódź" is "lodz" in both places.
const SPECIAL_LETTERS: Record<string, string> = {
  æ: "ae",
  đ: "d",
  ð: "d",
  ħ: "h",
  ı: "i",
  ł: "l",
  ø: "o",
  œ: "oe",
  ß: "ss",
  ŧ: "t",
};

/** Lower case, without accents: "Árpád" is "arpad". `fold_text()` in the database does the same. */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[æđðħıłøœßŧ]/g, (letter) => SPECIAL_LETTERS[letter] ?? letter);
}

// The punctuation and the spaces that a search ignores: the ASCII ones and a
// fixed list of others. `search_key()` in the database removes exactly these.
// Symbols such as "♯" or "♪" stay. A class such as `\p{P}` or `[:punct:]`
// would depend on the database locale.
// eslint-disable-next-line no-irregular-whitespace -- the separators include the non-breaking spaces
const SEPARATORS = /[\t\n\v\f\r  !-/:-@[-`{-~‘’‚“”„–—…«»‹›¡¿·]+/g;

/**
 * The text that a song search compares: lower case, without accents, and
 * without punctuation and spaces. "Ten-thousand Reasons!" is "tenthousandreasons".
 * `search_key()` in the database does the same.
 */
export function searchKey(text: string): string {
  return foldText(text).replace(SEPARATORS, "");
}

/** True when `text` contains `query`. Punctuation, spaces, case and accents do not count. */
export function matchesSearch(text: string, query: string): boolean {
  return searchKey(text).includes(searchKey(query));
}

/**
 * True when the title, the artist or the songbook of the song contains
 * `query`, as `filter_songs()` without the tags and the lyrics. For the song
 * searches in the browser.
 */
export function songMatchesSearch(
  song: { title: string; artist: string | null; songbook?: string | null },
  query: string,
): boolean {
  return (
    matchesSearch(song.title, query) ||
    (song.artist != null && matchesSearch(song.artist, query)) ||
    (song.songbook != null && matchesSearch(song.songbook, query))
  );
}

/**
 * The songbook of the song when it contains `query`, else null. The song
 * lists show it: it tells why the song matches. A query of only spaces and
 * punctuation matches every song, so it gives null.
 */
export function matchingSongbook(song: { songbook?: string | null }, query: string): string | null {
  const key = searchKey(query);
  return key !== "" && song.songbook != null && searchKey(song.songbook).includes(key)
    ? song.songbook
    : null;
}

/**
 * True when the songbook of the song ends with `query`, as in `filter_songs()`:
 * "Dicsérd az Urat 12" for "urat 12", but not "Dicsérd az Urat 120".
 */
export function songbookEndsWithSearch(song: { songbook?: string | null }, query: string): boolean {
  const key = searchKey(query);
  return key !== "" && song.songbook != null && searchKey(song.songbook).endsWith(key);
}
