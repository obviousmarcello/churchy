import type { ScriptureReference } from "./reference";

// The verses of a reference in the text of a book. The chapters and the
// verses are those of the translation: e.g. the title of a psalm can be its
// first verse.

/** The text of a book in a translation: `chapters[c - 1][v - 1]` is the verse c:v. An empty text: the translation has no such verse. */
export type BibleBook = { chapters: string[][] };

export type ScriptureVerse = {
  chapter: number;
  verse: number;
  text: string;
  /** The OSIS id of the book, when it is not the book of the reference: a verse that the controller loaded after it (see `more.ts`). */
  book?: string;
};

export type ScripturePassage = {
  /** In the order of the reference, each verse once. */
  verses: ScriptureVerse[];
  /** The reference names a chapter or a verse that the book does not have, or a verse without text. */
  missing: boolean;
  /** The reference has more than `MAX_PASSAGE_VERSES` verses: `verses` has only the first ones. */
  truncated: boolean;
};

/** Psalm 119 has 176 verses. More: the reference is too long to project. */
export const MAX_PASSAGE_VERSES = 200;

export function resolvePassage(reference: ScriptureReference, book: BibleBook): ScripturePassage {
  const verses: ScriptureVerse[] = [];
  const seen = new Set<string>();
  let missing = false;

  for (const { from, to } of reference.ranges) {
    for (let chapter = from.chapter; chapter <= to.chapter; chapter++) {
      const texts = book.chapters[chapter - 1];
      if (!texts) {
        missing = true;
        continue;
      }
      const first = chapter === from.chapter && from.verse !== null ? from.verse : 1;
      const last = chapter === to.chapter && to.verse !== null ? to.verse : texts.length;
      if (first > texts.length || last > texts.length) missing = true;
      for (let verse = first; verse <= Math.min(last, texts.length); verse++) {
        const key = `${chapter}:${verse}`;
        const text = texts[verse - 1];
        if (!text) missing = true;
        if (seen.has(key) || !text) continue;
        seen.add(key);
        if (verses.length === MAX_PASSAGE_VERSES) return { verses, missing, truncated: true };
        verses.push({ chapter, verse, text });
      }
    }
  }
  return { verses, missing, truncated: false };
}
