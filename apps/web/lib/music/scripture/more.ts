import { nextBook } from "./books";
import type { BibleBook, ScriptureVerse } from "./passage";

// "Load more" after the verses of a scripture reading on the controller: the
// rest of the chapter of the last verse, or else the next chapter, also in
// the next book. Only on the controller: the event keeps its reference.

/** The verses from `fromVerse` to the end of the chapter. */
export type PassagePart = { book: string; chapter: number; fromVerse: number };

/** The last verse that the controller has, with its book. */
export type VersePlace = { book: string; chapter: number; verse: number };

/**
 * The part after `last`. `text`: the book of `last`. Null after the last
 * verse of the last book.
 */
export function nextPassagePart(
  last: VersePlace,
  text: BibleBook,
  deuterocanon: boolean,
): PassagePart | null {
  const verses = text.chapters[last.chapter - 1] ?? [];
  if (verses.slice(last.verse).some((verse) => verse))
    return { book: last.book, chapter: last.chapter, fromVerse: last.verse + 1 };
  if (last.chapter < text.chapters.length)
    return { book: last.book, chapter: last.chapter + 1, fromVerse: 1 };
  const book = nextBook(last.book, deuterocanon);
  return book ? { book, chapter: 1, fromVerse: 1 } : null;
}

/** The verses of the part. `referenceBook`: the book of the reference; the verses of another book have their `book`. */
export function partVerses(
  part: PassagePart,
  text: BibleBook,
  referenceBook: string,
): ScriptureVerse[] {
  const verses = text.chapters[part.chapter - 1] ?? [];
  return verses.flatMap((verseText, index) =>
    index + 1 >= part.fromVerse && verseText
      ? [
          {
            chapter: part.chapter,
            verse: index + 1,
            text: verseText,
            ...(part.book !== referenceBook && { book: part.book }),
          },
        ]
      : [],
  );
}

/** The last verse of the part, for `nextPassagePart`. */
export function lastPlace(part: PassagePart, text: BibleBook): VersePlace {
  return {
    book: part.book,
    chapter: part.chapter,
    verse: Math.max(part.fromVerse, text.chapters[part.chapter - 1]?.length ?? 0),
  };
}
