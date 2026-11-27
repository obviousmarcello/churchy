import { describe, expect, it } from "vitest";

import { lastPlace, nextPassagePart, partVerses } from "./more";

const JOHN = {
  chapters: [
    ["a1", "a2", "a3"],
    ["b1", "b2", ""],
  ],
};

describe("nextPassagePart", () => {
  it("gives the rest of the chapter, then the next chapter, then the next book", () => {
    expect(nextPassagePart({ book: "John", chapter: 1, verse: 1 }, JOHN, false)).toEqual({
      book: "John",
      chapter: 1,
      fromVerse: 2,
    });
    expect(nextPassagePart({ book: "John", chapter: 1, verse: 3 }, JOHN, false)).toEqual({
      book: "John",
      chapter: 2,
      fromVerse: 1,
    });
    // The empty verse at the end does not count.
    expect(nextPassagePart({ book: "John", chapter: 2, verse: 2 }, JOHN, false)).toEqual({
      book: "Acts",
      chapter: 1,
      fromVerse: 1,
    });
    expect(
      nextPassagePart(
        { book: "Rev", chapter: 1, verse: 3 },
        { chapters: [["x", "y", "z"]] },
        false,
      ),
    ).toBeNull();
  });
});

describe("partVerses", () => {
  it("gives the verses to the end of the chapter, with the book when it is another one", () => {
    const part = { book: "John", chapter: 1, fromVerse: 2 };
    expect(partVerses(part, JOHN, "John")).toEqual([
      { chapter: 1, verse: 2, text: "a2" },
      { chapter: 1, verse: 3, text: "a3" },
    ]);
    expect(
      partVerses({ book: "John", chapter: 2, fromVerse: 1 }, JOHN, "Luke").map(
        (verse) => verse.book,
      ),
    ).toEqual(["John", "John"]);
    expect(lastPlace(part, JOHN)).toEqual({ book: "John", chapter: 1, verse: 3 });
  });
});
