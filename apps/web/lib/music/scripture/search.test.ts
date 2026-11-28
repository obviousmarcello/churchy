import { describe, expect, it } from "vitest";

import { BOOK_NAME_COUNTS, bookName } from "./book-names";
import { BOOK_IDS } from "./books";
import {
  buildSearchIndex,
  matchBooks,
  normalizeSearchText,
  searchSegments,
  searchVerses,
  searchWords,
} from "./search";

describe("bookName", () => {
  it("has a name of each book in both languages", () => {
    expect(BOOK_NAME_COUNTS).toEqual({ hu: BOOK_IDS.length, en: BOOK_IDS.length });
    expect(bookName("John", "hu")).toBe("János");
    expect(bookName("John", "en")).toBe("John");
    expect(bookName("1Cor", "hu")).toBe("1 Korinthusiakhoz");
    expect(bookName("Rev", "de")).toBe("Revelation");
  });
});

describe("normalizeSearchText", () => {
  it("removes the accents and the case, as the song search", () => {
    expect(normalizeSearchText("Őrizd Ézsaiás")).toBe("orizd ezsaias");
    expect(normalizeSearchText("Árpa")).toBe("arpa");
    expect(normalizeSearchText("Straße Łódź")).toBe("strasse lodz");
  });
});

describe("matchBooks", () => {
  it("finds the books by the start of a name or an abbreviation", () => {
    expect(matchBooks("zsolt", BOOK_IDS)).toEqual(["Ps"]);
    expect(matchBooks("1 kor", BOOK_IDS)).toEqual(["1Cor"]);
    expect(matchBooks("kor", BOOK_IDS)).toEqual(["1Cor", "2Cor"]);
    expect(matchBooks("janos", BOOK_IDS)).toEqual(["John", "1John", "2John", "3John"]);
    expect(matchBooks("Psa", BOOK_IDS)).toEqual(["Ps"]);
    expect(matchBooks("Ap. Csel", BOOK_IDS)).toEqual(["Acts"]);
  });

  it("keeps the order of the ids, and gives all of them for an empty query", () => {
    expect(matchBooks(" ", ["Rev", "Gen"])).toEqual(["Rev", "Gen"]);
    expect(matchBooks("gen", ["Rev", "John"])).toEqual([]);
  });
});

const INDEX = buildSearchIndex([
  {
    id: "John",
    book: {
      chapters: [
        ["Kezdetben vala az Ige.", ""],
        ["", "", "Mert úgy szerette Isten e világot.", "A világot szerette Isten."],
      ],
    },
  },
  { id: "1John", book: { chapters: [["Szerette a világot."]] } },
]);

describe("searchVerses", () => {
  it("gives the verses with all words, without the empty verses", () => {
    expect(INDEX).toHaveLength(4);
    expect(searchVerses(INDEX, "ISTEN vilagot", 10)).toEqual({
      verses: [
        { book: "John", chapter: 2, verse: 3, text: "Mert úgy szerette Isten e világot." },
        { book: "John", chapter: 2, verse: 4, text: "A világot szerette Isten." },
      ],
      total: 2,
    });
  });

  it("gives the verses with the words together first, and at most `limit`", () => {
    const { verses, total } = searchVerses(INDEX, "szerette, a világot", 2);
    expect(total).toBe(3);
    expect(verses.map(({ book, verse }) => `${book} ${verse}`)).toEqual(["1John 1", "John 3"]);
    expect(searchVerses(INDEX, "szerette", 1)).toEqual({
      verses: [expect.objectContaining({ verse: 3 })],
      total: 3,
    });
  });

  it("gives nothing for a query without words", () => {
    expect(searchWords(" , . ")).toEqual([]);
    expect(searchVerses(INDEX, " , ", 10)).toEqual({ verses: [], total: 0 });
  });
});

describe("searchSegments", () => {
  it("marks the words of the query in the text", () => {
    expect(searchSegments("Mert úgy szerette Isten e világot.", "VILAG isten")).toEqual([
      { text: "Mert úgy szerette ", match: false },
      { text: "Isten", match: true },
      { text: " e ", match: false },
      { text: "világ", match: true },
      { text: "ot.", match: false },
    ]);
    expect(searchSegments("Ige", "")).toEqual([{ text: "Ige", match: false }]);
  });

  it("marks the right characters after a character that the folding makes longer or shorter", () => {
    expect(searchSegments("Die Straße ist lang", "lang")).toEqual([
      { text: "Die Straße ist ", match: false },
      { text: "lang", match: true },
    ]);
    expect(searchSegments("Große Gnade", "grosse")).toEqual([
      { text: "Große", match: true },
      { text: " Gnade", match: false },
    ]);
    expect(searchSegments("𝔄 Ige", "ige")).toEqual([
      { text: "𝔄 ", match: false },
      { text: "Ige", match: true },
    ]);
  });
});
