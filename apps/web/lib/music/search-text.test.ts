import { describe, expect, it } from "vitest";

import { matchesSearch, matchingSongbook, searchKey, songbookEndsWithSearch } from "./search-text";

describe("searchKey", () => {
  it("removes punctuation, spaces, case and accents", () => {
    expect(searchKey("Ten-thousand Reasons!")).toBe("tenthousandreasons");
    expect(searchKey("Áldjad, lelkem…")).toBe("aldjadlelkem");
    expect(searchKey("Don’t stop")).toBe("dontstop");
    expect(searchKey("«Áldjad» ¿lelkem?")).toBe("aldjadlelkem");
  });

  it("keeps symbols, as search_key() in the database", () => {
    expect(searchKey("C♯ Blues")).toBe("c♯blues");
    expect(searchKey("♪")).toBe("♪");
  });

  it("changes the letters that unaccent changes", () => {
    expect(searchKey("Łódź")).toBe("lodz");
    expect(searchKey("Ørsted, Æsir")).toBe("orstedaesir");
    expect(searchKey("Straße")).toBe("strasse");
  });
});

describe("matchesSearch", () => {
  it("ignores commas, dots and other punctuation on both sides", () => {
    expect(matchesSearch("Amazing, Grace", "amazing grace")).toBe(true);
    expect(matchesSearch("Amazing Grace", "amazing, grace.")).toBe(true);
    expect(matchesSearch("Ten-thousand Reasons", "ten thousand")).toBe(true);
    expect(matchesSearch("Don't stop", "dont")).toBe(true);
  });

  it("matches everything with a query of only punctuation", () => {
    expect(matchesSearch("Amazing Grace", ".,")).toBe(true);
  });

  it("does not match other text", () => {
    expect(matchesSearch("Amazing Grace", "glory")).toBe(false);
  });
});

describe("matchingSongbook", () => {
  const song = { songbook: "Dicsérd az Urat 123" };

  it("gives the songbook when it contains the search", () => {
    expect(matchingSongbook(song, "urat 12")).toBe("Dicsérd az Urat 123");
    expect(matchingSongbook(song, "124")).toBeNull();
    expect(matchingSongbook({ songbook: null }, "urat")).toBeNull();
  });

  it("gives null for a search of only spaces and punctuation", () => {
    expect(matchingSongbook(song, "")).toBeNull();
    expect(matchingSongbook(song, " ? ")).toBeNull();
  });
});

describe("songbookEndsWithSearch", () => {
  it("is true only for the songbook that ends with the search", () => {
    expect(songbookEndsWithSearch({ songbook: "Dicsérd az Urat 12" }, "urat 12")).toBe(true);
    expect(songbookEndsWithSearch({ songbook: "Dicsérd az Urat 120" }, "urat 12")).toBe(false);
    expect(songbookEndsWithSearch({ songbook: "Dicsérd az Urat 12" }, "?")).toBe(false);
  });
});
