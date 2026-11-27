// The psalm of the day: Psalm 1 on the first day, Psalm 2 on the next, and
// so on. After Psalm 150 the cycle starts again at Psalm 1.
//
// The day is the viewer's calendar day, so all viewers in one time zone see
// the same psalm, and it changes at their local midnight.

export const PSALM_COUNT = 150;

/** The calendar day that shows Psalm 1. */
const FIRST_DAY = Date.UTC(2026, 9, 11);

const DAY_MS = 24 * 60 * 60 * 1000;

/** The number of the psalm (1–150) for the local calendar day of `date`. */
export function psalmOfDay(date: Date): number {
  // The local calendar date as UTC midnight, so a daylight saving change
  // does not move the day.
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((day - FIRST_DAY) / DAY_MS);
  return (((days % PSALM_COUNT) + PSALM_COUNT) % PSALM_COUNT) + 1;
}

/** The local calendar day of `date`, e.g. "2026-10-19". */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Milliseconds from `date` to the next local midnight. */
export function msToNextDay(date: Date): number {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return next.getTime() - date.getTime();
}

/** One or more verses of a psalm, e.g. 23:1–2. */
export type PsalmVerses = {
  first: number;
  last: number;
  text: string;
};

/** The longest excerpt of the day, in characters, and the most verses in it. */
export const EXCERPT_MAX_LENGTH = 260;
export const EXCERPT_MAX_VERSES = 3;

/**
 * The verses of the day from the verses of a psalm (Károli 1908, public domain): from the first
 * verse on, while the text stays short, at least one verse. Empty verses are skipped (a psalm
 * title can be a verse of its own).
 */
export function psalmExcerpt(verses: readonly string[]): PsalmVerses | null {
  let first = 0;
  let last = 0;
  let text = "";
  for (const [index, verse] of verses.entries()) {
    const clean = verse.trim();
    if (!clean) continue;
    if (first === 0) {
      first = index + 1;
      last = first;
      text = clean;
      continue;
    }
    if (last - first + 1 >= EXCERPT_MAX_VERSES) break;
    if (text.length + 1 + clean.length > EXCERPT_MAX_LENGTH) break;
    last = index + 1;
    text += ` ${clean}`;
  }
  return first === 0 ? null : { first, last, text };
}
