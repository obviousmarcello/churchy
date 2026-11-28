import { parseScriptureReference, type ScriptureReference } from "./reference";

// The verses of a scripture reading in a text that the user pasted from a
// Bible app or a website, for the shared cache of a "pasted" translation
// (see `translations.ts`). The verse numbers split the text, e.g.
// "16 Mert úgy szerette Isten a világot… 17 Mert nem azért küldte…" or
// "16Mert úgy…". Only the numbers that the reference expects next split it,
// so another number in the text stays in the verse. The text after the last
// verse of the reference (e.g. the rest of a copied chapter) is not in it.

/** `chapterEnd`: the last verse of a chapter that the reference reads to its end, e.g. Jn 3,36 for "Jn 3". */
export type PastedVerse = { chapter: number; verse: number; text: string; chapterEnd?: true };

export type PastedVerses =
  | { status: "ok"; verses: PastedVerse[] }
  /** No text. */
  | { status: "empty" }
  /** The text does not have this verse of the reference (or it has no verse numbers). */
  | { status: "missing"; chapter: number; verse: number }
  /** More verses than the cache can keep for the book. */
  | { status: "tooMany"; count: number; max: number };

/** A chapter of the reference: its verses from `first` to `last` (null: to the end of the chapter, which the text tells). */
type Segment = { chapter: number; first: number; last: number | null };

const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const SUPERSCRIPT_DIGIT = new RegExp(`[${SUPERSCRIPT_DIGITS}]`, "g");

/** The verses of `reference` in `text`. `max`: the most verses that the cache can keep for the book. */
export function parsePastedVerses(
  text: string,
  reference: ScriptureReference,
  max: number,
): PastedVerses {
  const clean = cleanText(text);
  if (!clean) return { status: "empty" };

  const segments = segmentsOf(reference);
  if (segments.length === 0)
    return { status: "missing", chapter: reference.ranges[0]?.from.chapter ?? 1, verse: 1 };
  const verses: PastedVerse[] = [];
  const numbers = [...clean.matchAll(/(?<!\d)\d{1,3}(?!\d)/g)];

  // The place of the last verse that the text has: the segment and the verse.
  let segment = -1;
  let verse = 0;
  let start = 0;
  // After the last verse of a segment: where the number of the verse after it is. Its text ends there.
  let end: number | undefined;
  for (const [index, match] of numbers.entries()) {
    const value = Number(match[0]);
    const current = segments[segment];
    const following = segments[segment + 1];
    const done = !current || (current.last !== null && verse >= current.last);
    let next: { segment: number; verse: number } | null = null;
    if (!done && value === verse + 1) next = { segment, verse: value };
    else if (
      following?.first === value &&
      (done || !continuesChapter(numbers, index, verse + 1, value + 1))
    ) {
      next = { segment: segment + 1, verse: value };
    } else if (current && done && end === undefined && value === verse + 1) end = match.index;
    if (!next) continue;

    if (current)
      verses.push({
        chapter: current.chapter,
        verse,
        text: clean.slice(start, end ?? match.index).trim(),
      });
    segment = next.segment;
    verse = next.verse;
    start = match.index + match[0].length;
    end = undefined;
  }
  const current = segments[segment];
  if (current)
    verses.push({
      chapter: current.chapter,
      verse,
      text: clean.slice(start, end).trim(),
    });

  // A reference of one verse: a text without its number is the verse.
  const first = segments[0]!;
  const only = segments.length === 1 && first.first === first.last ? first : null;
  if (only && segment < 0) {
    verses.push({ chapter: only.chapter, verse: only.first, text: clean });
    segment = 0;
    verse = only.first;
  }

  if (segment < 0) return { status: "missing", chapter: first.chapter, verse: first.first };
  const empty = verses.find((pasted) => !pasted.text);
  if (empty) return { status: "missing", chapter: empty.chapter, verse: empty.verse };
  const { chapter, last } = segments[segment]!;
  if (last !== null && verse < last) return { status: "missing", chapter, verse: verse + 1 };
  const after = segments[segment + 1];
  if (after) return { status: "missing", chapter: after.chapter, verse: after.first };

  const unique = [
    ...new Map(verses.map((pasted) => [`${pasted.chapter}:${pasted.verse}`, pasted])).values(),
  ];
  if (unique.length > max) return { status: "tooMany", count: unique.length, max };
  // The last verse of each chapter that the reference reads to its end.
  for (const { chapter, last } of segments) {
    const final =
      last === null ? unique.findLast((pasted) => pasted.chapter === chapter) : undefined;
    if (final) final.chapterEnd = true;
  }
  return { status: "ok", verses: unique };
}

/**
 * In a chapter that the reference reads to its end: the number of the first
 * verse of the next segment (at `index`) is a verse number, or another number
 * in the text, e.g. the "1" of "1 Mózes". It is another number when the text
 * after it goes on with `verseNext` of this chapter before `jumpNext`, the
 * verse after it in the next segment.
 */
function continuesChapter(
  numbers: RegExpMatchArray[],
  index: number,
  verseNext: number,
  jumpNext: number,
): boolean {
  for (const match of numbers.slice(index + 1)) {
    const value = Number(match[0]);
    if (value === verseNext) return true;
    if (value === jumpNext) return false;
  }
  return false;
}

/** The chapters of the reference, in order. */
function segmentsOf(reference: ScriptureReference): Segment[] {
  return reference.ranges.flatMap(({ from, to }) => {
    const segments: Segment[] = [];
    for (let chapter = from.chapter; chapter <= to.chapter; chapter++) {
      const first = chapter === from.chapter && from.verse !== null ? from.verse : 1;
      const last = chapter === to.chapter && to.verse !== null ? to.verse : null;
      if (last === null || last >= first) segments.push({ chapter, first, last });
    }
    return segments;
  });
}

/** A line with only a reference, e.g. "János 3", "János 3:16-17 RÚF" or "1Korinthusi levél 13". */
const REFERENCE_LINE =
  /^(?:[1-5]\.?\s*)?\p{L}[\p{L}.\s]*\s\d{1,3}(?:[:,]\d{1,3}(?:[-–]\d{1,3})?)?(?:\s*\(?(?:RÚF|RUF)(?:\s*2014)?\)?)?$/iu;

/**
 * Cross-references after a verse: in brackets, e.g. "(1Jn 4,9)" on
 * szentiras.eu, or a list, e.g. "Ez 36,25-27; Ef 5,26" on abibliamindenkie.hu.
 * `withoutCrossReferences` removes only those whose first part is a reference.
 */
const CROSS_REFERENCES =
  /\(([^()]{1,200})\)|((?:[1-5]\s?)?\p{L}{1,12}\.?\s?\d{1,3},\d{1,3}(?:[-–.]\d{1,3})*(?:\s*;\s*(?:(?:[1-5]\s?)?\p{L}{1,12}\.?\s?)?\d{1,3}(?:,\d{1,3})?(?:[-–.]\d{1,3})*)*)/gu;

function withoutCrossReferences(line: string): string {
  return line.replace(CROSS_REFERENCES, (match, inBrackets?: string, list?: string) =>
    parseScriptureReference((inBrackets ?? list ?? "").split(";")[0]!.trim()) ? " " : match,
  );
}

/** A section heading of the Bible text: a short line without numbers and without a mark at its end. */
function isHeading(line: string): boolean {
  return line.length <= 80 && !/\d/.test(line) && !/[.,;:!?…"”'’»)\]–-]$/.test(line);
}

/**
 * The line before a heading: none, a chapter number, or the end of a
 * sentence. Else the line like a heading is a line of a poem, e.g. "és nem ül
 * a csúfolódók székére" after "aki nem jár a bűnösök tanácsán,".
 */
function endsSection(line: string | undefined): boolean {
  return line === undefined || /^\d{1,3}$/.test(line) || /[.!?…"”'’»)\]]$/.test(line);
}

/**
 * The text in one line. It removes what a Bible app or website adds around
 * the verses, e.g. the copy of a chapter of bible.com:
 *
 *     János 3
 *     3
 *     Nikodémus Jézusnál
 *     1Volt a farizeusok között… 2Ő egy éjjel…
 *     Keresztelő János öröme
 *     22Ezek után…
 *
 * Without: the reference lines, the chapter numbers, the section headings
 * (before a line that starts with a verse number), the lines like headings
 * at the end (e.g. the buttons of the website), the cross-references, the
 * links, the footnote marks, the brackets of "[16]", and the quotes around
 * the text. Superscript verse numbers become digits.
 */
function cleanText(text: string): string {
  const lines = text
    .normalize("NFC")
    .replace(SUPERSCRIPT_DIGIT, (digit) => String(SUPERSCRIPT_DIGITS.indexOf(digit)))
    .split(/\r?\n/)
    .map((line) =>
      withoutCrossReferences(line)
        .replace(/^[*\s]+$/, "")
        .trim(),
    )
    .filter((line) => line && !/^https?:\/\/\S+$/.test(line) && !REFERENCE_LINE.test(line));
  // The lines like headings at the end, after the end of a sentence.
  let tail = lines.length;
  while (tail > 1 && isHeading(lines[tail - 1]!)) tail--;
  if (tail < lines.length && endsSection(lines[tail - 1]!)) lines.length = tail;
  const kept = lines.filter((line, index) => {
    const next = lines[index + 1] ?? "";
    const beforeVerse = /^\[?\d/.test(next);
    // A chapter number before a heading or a verse, or a heading before a verse.
    if (/^\d{1,3}$/.test(line)) return !(beforeVerse || isHeading(next));
    return !(beforeVerse && isHeading(line) && endsSection(lines[index - 1]));
  });
  return kept
    .join(" ")
    .replace(/\[(\d{1,3})\]/g, " $1 ")
    .replace(/\[[a-z*]\]|[*†‡#]/g, "")
    .replace(/^["“„]|["”]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
