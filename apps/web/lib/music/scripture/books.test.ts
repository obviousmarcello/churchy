import { describe, expect, it } from "vitest";

import { bookAbbreviation, bookId, BOOKS, nextBook } from "./books";

describe("bookId", () => {
  it("gives each name one book", () => {
    for (const [id, names] of BOOKS) {
      for (const name of names.split(" ")) expect(bookId(name), name).toBe(id);
    }
  });

  it("accepts the names as the users type them", () => {
    expect(bookId("1 Kor.")).toBe("1Cor");
    expect(bookId("Ap.Csel.")).toBe("Acts");
    expect(bookId("Song of Songs")).toBe("Song");
    expect(bookId("ZSOLT")).toBe("Ps");
    expect(bookId("Júd")).toBe("Jude");
    expect(bookId("Jud")).toBe("Jdt");
    expect(bookId("Kor")).toBeNull();
    expect(bookId("Ének")).toBeNull();
  });
});

describe("bookAbbreviation and nextBook", () => {
  it("has an abbreviation of each book in both languages", () => {
    for (const [id] of BOOKS) {
      expect(bookId(bookAbbreviation(id, false)) ?? id, id).toBe(id);
      expect(bookAbbreviation(id, true)).not.toBe("");
    }
    expect(bookAbbreviation("Acts", false)).toBe("ApCsel");
    expect(bookAbbreviation("1Cor", true)).toBe("1 Cor");
  });

  it("gives the next book, also into the New Testament", () => {
    expect(nextBook("John", false)).toBe("Acts");
    expect(nextBook("Mal", false)).toBe("Matt");
    expect(nextBook("Rev", false)).toBeNull();
    expect(nextBook("Rev", true)).toBe("Tob");
  });
});
