import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BOOK_IDS, DEUTEROCANONICAL_BOOKS } from "./books";
import { BOOK_VERSE_COUNTS, bookLimit, CACHE_MAX_VERSES } from "./cache-limits";

describe("the limits of the scripture cache", () => {
  it("keeps 331 verses of a church at one time", () => {
    expect(CACHE_MAX_VERSES).toBe(331);
  });

  it("has the verse count of each book of Károli", () => {
    const books = BOOK_IDS.filter((book) => !DEUTEROCANONICAL_BOOKS.has(book));
    expect(Object.keys(BOOK_VERSE_COUNTS)).toEqual(books);
    for (const book of books) {
      const file = join(process.cwd(), "public", "bible", "karoli1908", `${book}.json`);
      const { chapters } = JSON.parse(readFileSync(file, "utf8")) as { chapters: string[][] };
      expect(BOOK_VERSE_COUNTS[book], book).toBe(
        chapters.reduce((sum, verses) => sum + verses.length, 0),
      );
    }
  });

  it("keeps less than half of a book", () => {
    expect(bookLimit("Jude")).toBe(12);
    expect(bookLimit("2John")).toBe(6);
    expect(bookLimit("Hag")).toBe(18);
    expect(bookLimit("John")).toBe(CACHE_MAX_VERSES);
    expect(bookLimit("Sir")).toBe(0);
  });
});
