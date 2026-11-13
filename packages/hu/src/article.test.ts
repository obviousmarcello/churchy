import { describe, expect, it } from "vitest";
import { article, leadingNumberWord, withArticle } from "./index";

describe("article before words", () => {
  it.each([
    ["templom", "a"],
    ["miserend", "a"],
    ["plébánia", "a"],
    ["egyház", "az"],
    ["istentisztelet", "az"],
    ["óra", "az"],
    ["Ünnep", "az"],
    ["üzenet", "az"],
    ["őrangyal", "az"],
    ["Ősz", "az"],
    ["úrvacsora", "az"],
    ["Űrlap", "az"],
    ["ősi", "az"],
    ["áldás", "az"],
    ["Érsek", "az"],
    ["ima", "az"],
    ["író", "az"],
    ["Ödön", "az"],
    ["hír", "a"],
    ["Zsolt", "a"],
    ["ly", "a"],
    ["„idézet”", "az"],
    ['"templom"', "a"],
    ["(egyház)", "az"],
    ["", "a"],
    ["...", "a"],
  ])("article(%j) = %s", (word, expected) => {
    expect(article(word)).toBe(expected);
  });
});

describe("article before numbers (spoken form)", () => {
  it.each([
    ["0", "a"], // nulla
    ["1", "az"], // egy
    ["2", "a"], // kettő
    ["3", "a"],
    ["4", "a"],
    ["5", "az"], // öt
    ["6", "a"],
    ["7", "a"],
    ["8", "a"],
    ["9", "a"],
    ["10", "a"], // tíz
    ["11", "a"], // tizenegy
    ["15", "a"],
    ["20", "a"], // húsz
    ["21", "a"], // huszonegy
    ["30", "a"], // harminc
    ["40", "a"], // negyven
    ["50", "az"], // ötven
    ["51", "az"], // ötvenegy
    ["60", "a"],
    ["70", "a"],
    ["80", "a"],
    ["90", "a"],
    ["99", "a"],
    ["100", "a"], // száz
    ["101", "a"],
    ["200", "a"], // kétszáz
    ["300", "a"],
    ["400", "a"],
    ["500", "az"], // ötszáz
    ["555", "az"],
    ["600", "a"],
    ["900", "a"],
    ["1000", "az"], // ezer
    ["1001", "az"], // ezeregy
    ["1956", "az"], // ezerkilencszázötvenhat
    ["1999", "az"],
    ["2000", "a"], // kétezer
    ["2026", "a"], // kétezer-huszonhat
    ["3000", "a"],
    ["5000", "az"], // ötezer
    ["10000", "a"], // tízezer
    ["50000", "az"], // ötvenezer
    ["100000", "a"], // százezer
    ["500000", "az"], // ötszázezer
    ["1000000", "az"], // egymillió
    ["2000000", "a"], // kétmillió
    ["5000000", "az"], // ötmillió
    ["1000000000", "az"], // egymilliárd
    ["007", "a"], // hét
  ])("article(%j) = %s", (num, expected) => {
    expect(article(num)).toBe(expected);
  });

  it("handles thousands separators", () => {
    expect(article("1 000 000")).toBe("az");
    expect(article("1 000")).toBe("az");
    expect(article("1 000 000")).toBe("az");
    expect(article("5 000")).toBe("az");
    expect(article("2 026")).toBe("a");
    expect(article("10 000")).toBe("a");
  });

  it("handles ordinals and suffixed numbers", () => {
    expect(article("1.")).toBe("az"); // első
    expect(article("5.")).toBe("az"); // ötödik
    expect(article("10.")).toBe("a"); // tizedik
    expect(article("2.")).toBe("a"); // második
    expect(article("100.")).toBe("a"); // századik
    expect(article("5-ös")).toBe("az"); // ötös
    expect(article("10-es")).toBe("a"); // tízes
    expect(article("5. vasárnap")).toBe("az");
    expect(article("10 órai mise")).toBe("a");
    expect(article("1956-os forradalom")).toBe("az");
  });

  it("handles decimals, signs and wrapping punctuation", () => {
    expect(article("5,5")).toBe("az");
    expect(article("0,5")).toBe("a");
    expect(article("-5")).toBe("a"); // mínusz öt
    expect(article("−1")).toBe("a"); // mínusz egy
    expect(article("+5")).toBe("a"); // plusz öt
    expect(article("(5)")).toBe("az");
    expect(article("18:00")).toBe("a"); // tizennyolc
    expect(article("1 0000")).toBe("az"); // "1" then another number
  });

  it("treats a leading dash before a letter as punctuation", () => {
    expect(article("-egyház")).toBe("az");
  });
});

describe("leadingNumberWord", () => {
  it.each([
    ["0", "nulla"],
    ["1", "egy"],
    ["2", "kettő"],
    ["5", "öt"],
    ["10", "tíz"],
    ["13", "tizen"],
    ["20", "húsz"],
    ["25", "huszon"],
    ["50", "ötven"],
    ["100", "száz"],
    ["250", "két"],
    ["500", "öt"],
    ["1000", "ezer"],
    ["1956", "ezer"],
    ["2026", "két"],
    ["12000", "tizen"],
    ["1000000", "egy"],
    ["3000000", "három"],
  ])("leadingNumberWord(%j) = %s", (digits, word) => {
    expect(leadingNumberWord(digits)).toBe(word);
  });

  it("rejects non-digits", () => {
    expect(() => leadingNumberWord("12a")).toThrow(RangeError);
    expect(() => leadingNumberWord("")).toThrow(RangeError);
  });
});

describe("withArticle", () => {
  it("prefixes words and numbers", () => {
    expect(withArticle("miserend")).toBe("a miserend");
    expect(withArticle("istentiszteleti rend")).toBe("az istentiszteleti rend");
    expect(withArticle("5. vasárnap")).toBe("az 5. vasárnap");
    expect(withArticle("10 órai mise")).toBe("a 10 órai mise");
    expect(withArticle("2026. november 12.")).toBe("a 2026. november 12.");
  });

  it("can capitalise the article", () => {
    expect(withArticle("miserend", { capitalize: true })).toBe("A miserend");
    expect(withArticle("egyház", { capitalize: true })).toBe("Az egyház");
  });
});
