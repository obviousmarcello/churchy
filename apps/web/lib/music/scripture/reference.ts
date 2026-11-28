import { bookAbbreviation, bookId } from "./books";

// A scripture reference as the users type it, in English or Hungarian:
//
// - English: "John 3:16-21", "John 3:16,18", "Ps 23:1-6; 24".
// - Hungarian: "Jn 3,16-21", "Jn 3,16.18", "Zsolt 23,1–6; 24".
// - Both: "1 Kor 13" (a chapter), "Mt 5,1–7,29" (more chapters).
//
// A ":" makes the reference English: ":" between the chapter and the verse,
// "," between the verses. Else "," is between the chapter and the verse, and
// "." between the verses. ";" separates the groups.

/** A place in a book. `verse` null: the start or the end of the chapter. */
export type ScripturePlace = { chapter: number; verse: number | null };

export type ScriptureRange = { from: ScripturePlace; to: ScripturePlace };

export type ScriptureReference = {
  /** The OSIS id, e.g. "John". */
  book: string;
  ranges: ScriptureRange[];
};

/** More is a typing error. Psalm 119 has 176 verses, and Psalms has 150 chapters. */
const MAX_NUMBER = 200;

const REFERENCE = /^(?:([1-5])\.?\s*)?(\p{L}[\p{L}.\s]*?)\.?\s*(\d[\d\s:,.;\-–—]*)$/u;

/** The reference in the text, or null when the text is not a reference to a known book. */
export function parseScriptureReference(text: string): ScriptureReference | null {
  const match = REFERENCE.exec(text.normalize("NFC").trim());
  if (!match) return null;
  const [, number, name, numbers] = match;
  const book = bookId(`${number ?? ""}${name}`);
  if (!book) return null;

  const places = numbers!
    .replace(/\s/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[,.;]+$/, "");
  const english = places.includes(":");
  const chapterSeparator = english ? ":" : ",";
  const verseSeparator = english ? "," : ".";

  const ranges: ScriptureRange[] = [];
  for (const group of places.split(";")) {
    // The chapter of the verses that follow, after a "chapter:verse".
    let chapter: number | null = null;
    for (const part of group.split(verseSeparator)) {
      const [start, end, ...rest] = part.split("-");
      if (rest.length > 0) return null;
      const from = place(start!, chapterSeparator);
      if (!from) return null;
      if (from.verse === null && chapter !== null) {
        // A verse in the chapter before, e.g. the 18 of "3:16,18".
        from.verse = from.chapter;
        from.chapter = chapter;
      }
      if (from.verse !== null) chapter = from.chapter;

      let to: ScripturePlace = { ...from };
      if (end !== undefined) {
        const parsed = place(end, chapterSeparator);
        if (!parsed) return null;
        if (parsed.verse !== null) {
          // "5,1-7,29": a verse in another chapter.
          to = parsed;
          chapter = parsed.chapter;
        } else if (from.verse !== null) {
          // "3,16-21": a verse in the same chapter.
          to = { chapter: from.chapter, verse: parsed.chapter };
        } else {
          // "1-2": whole chapters.
          to = { chapter: parsed.chapter, verse: null };
        }
      }
      if (
        to.chapter < from.chapter ||
        (to.chapter === from.chapter && (to.verse ?? Infinity) < (from.verse ?? 0))
      )
        return null;
      ranges.push({ from, to });
    }
  }
  return { book, ranges };
}

/** "3" or "3:16". Null for a part that is not a number or is too large. */
function place(text: string, chapterSeparator: string): ScripturePlace | null {
  const [chapter, verse, ...rest] = text.split(chapterSeparator);
  if (rest.length > 0) return null;
  const chapterNumber = number(chapter!);
  if (chapterNumber === null) return null;
  if (verse === undefined) return { chapter: chapterNumber, verse: null };
  const verseNumber = number(verse);
  return verseNumber === null ? null : { chapter: chapterNumber, verse: verseNumber };
}

function number(text: string): number | null {
  if (!/^\d{1,3}$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= MAX_NUMBER ? value : null;
}

/** How the user typed a reference: the book, e.g. "1 Kor", and the English or the Hungarian separators. */
export type ReferenceStyle = { book: string; english: boolean };

/** The style of a reference, or null when the text is not a reference (see `parseScriptureReference`). */
export function referenceStyle(text: string): ReferenceStyle | null {
  const trimmed = text.normalize("NFC").trim();
  const match = REFERENCE.exec(trimmed);
  if (!match || !parseScriptureReference(trimmed)) return null;
  return {
    book: trimmed.slice(0, trimmed.length - match[3]!.length).trim(),
    english: match[3]!.includes(":"),
  };
}

/**
 * A reference to the verses in the style of `style`, e.g. "Jn 3,16–18.20; 4,1"
 * or "John 3:16–18,20; 4:1". The verses are in order. A verse with `book` is
 * in another book than the reference, e.g. "Jn 21,25; ApCsel 1,1".
 */
export function formatVerses(
  style: ReferenceStyle,
  verses: { chapter: number; verse: number; book?: string }[],
): string {
  const [chapterSeparator, verseSeparator] = style.english ? [":", ","] : [",", "."];
  const groups: { book: string; chapter: number; runs: [number, number][] }[] = [];
  for (const { chapter, verse, book } of verses) {
    const name = book ? bookAbbreviation(book, style.english) : style.book;
    const group = groups.at(-1);
    const run = group?.runs.at(-1);
    if (!group || group.book !== name || group.chapter !== chapter)
      groups.push({ book: name, chapter, runs: [[verse, verse]] });
    else if (run && verse === run[1] + 1) run[1] = verse;
    else group.runs.push([verse, verse]);
  }
  return groups
    .map(({ book, chapter, runs }, index) => {
      const numbers = runs
        .map(([first, last]) => (first === last ? `${first}` : `${first}–${last}`))
        .join(verseSeparator);
      const place = `${chapter}${chapterSeparator}${numbers}`;
      return index === 0 || groups[index - 1]!.book !== book ? `${book} ${place}` : place;
    })
    .join("; ");
}
