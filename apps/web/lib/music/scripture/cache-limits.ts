// The limits of the cache of a "pasted" translation (see `translations.ts` and the migration
// `scripture_verse_cache`). Each church has its own cache. The limits are those of the music app,
// where they came from the quoting policy of a Bible publisher: less than half of a book, and 331
// verses at one time. They keep a pasted translation to short quotes.

/** The verses in the cache of a church at one time. The migration has the same number. */
export const CACHE_MAX_VERSES = 331;

// The verses of each book in Károli 1908 (`public/bible/karoli1908/`). A test
// checks them against the files. Another translation can count a few verses differently, so
// the limit of a book is close, not exact.
export const BOOK_VERSE_COUNTS: Readonly<Record<string, number>> = {
  Gen: 1533,
  Exod: 1212,
  Lev: 859,
  Num: 1287,
  Deut: 959,
  Josh: 658,
  Judg: 618,
  Ruth: 85,
  "1Sam": 811,
  "2Sam": 695,
  "1Kgs": 817,
  "2Kgs": 719,
  "1Chr": 942,
  "2Chr": 822,
  Ezra: 280,
  Neh: 406,
  Esth: 167,
  Job: 1069,
  Ps: 2527,
  Prov: 915,
  Eccl: 221,
  Song: 114,
  Isa: 1290,
  Jer: 1364,
  Lam: 154,
  Ezek: 1273,
  Dan: 357,
  Hos: 197,
  Joel: 73,
  Amos: 146,
  Obad: 21,
  Jonah: 48,
  Mic: 105,
  Nah: 47,
  Hab: 56,
  Zeph: 53,
  Hag: 38,
  Zech: 211,
  Mal: 55,
  Matt: 1071,
  Mark: 678,
  Luke: 1152,
  John: 880,
  Acts: 1006,
  Rom: 433,
  "1Cor": 437,
  "2Cor": 256,
  Gal: 149,
  Eph: 155,
  Phil: 104,
  Col: 95,
  "1Thess": 89,
  "2Thess": 47,
  "1Tim": 113,
  "2Tim": 83,
  Titus: 46,
  Phlm: 25,
  Heb: 303,
  Jas: 108,
  "1Pet": 105,
  "2Pet": 61,
  "1John": 105,
  "2John": 13,
  "3John": 15,
  Jude: 25,
  Rev: 405,
};

/** The verses of the book that the cache can keep: less than half of the book. 0 for a book without a count. */
export function bookLimit(book: string): number {
  const count = BOOK_VERSE_COUNTS[book] ?? 0;
  const limit = Math.ceil(count / 2) - 1;
  return Math.max(0, Math.min(CACHE_MAX_VERSES, limit));
}
