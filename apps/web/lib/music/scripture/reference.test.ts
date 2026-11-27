import { describe, expect, it } from "vitest";

import { formatVerses, parseScriptureReference, referenceStyle } from "./reference";

describe("parseScriptureReference", () => {
  it("reads the Hungarian form", () => {
    expect(parseScriptureReference("Jn 3,16-21")).toEqual({
      book: "John",
      ranges: [{ from: { chapter: 3, verse: 16 }, to: { chapter: 3, verse: 21 } }],
    });
    expect(parseScriptureReference("Jn 3,16.18")?.ranges).toEqual([
      { from: { chapter: 3, verse: 16 }, to: { chapter: 3, verse: 16 } },
      { from: { chapter: 3, verse: 18 }, to: { chapter: 3, verse: 18 } },
    ]);
    expect(parseScriptureReference("Róm 8,28; 12,1–2")?.ranges).toEqual([
      { from: { chapter: 8, verse: 28 }, to: { chapter: 8, verse: 28 } },
      { from: { chapter: 12, verse: 1 }, to: { chapter: 12, verse: 2 } },
    ]);
  });

  it("reads the English form", () => {
    expect(parseScriptureReference("John 3:16,18-19")?.ranges).toEqual([
      { from: { chapter: 3, verse: 16 }, to: { chapter: 3, verse: 16 } },
      { from: { chapter: 3, verse: 18 }, to: { chapter: 3, verse: 19 } },
    ]);
    expect(parseScriptureReference("Ps. 23:1-6; 24")).toEqual({
      book: "Ps",
      ranges: [
        { from: { chapter: 23, verse: 1 }, to: { chapter: 23, verse: 6 } },
        { from: { chapter: 24, verse: null }, to: { chapter: 24, verse: null } },
      ],
    });
  });

  it("reads chapters and ranges over chapters", () => {
    expect(parseScriptureReference("1 Kor 13")).toEqual({
      book: "1Cor",
      ranges: [{ from: { chapter: 13, verse: null }, to: { chapter: 13, verse: null } }],
    });
    expect(parseScriptureReference("Zsolt 1-2")?.ranges).toEqual([
      { from: { chapter: 1, verse: null }, to: { chapter: 2, verse: null } },
    ]);
    expect(parseScriptureReference("Mt 5,1–7,29")?.ranges).toEqual([
      { from: { chapter: 5, verse: 1 }, to: { chapter: 7, verse: 29 } },
    ]);
    expect(parseScriptureReference("John 3:16-4:2")?.ranges).toEqual([
      { from: { chapter: 3, verse: 16 }, to: { chapter: 4, verse: 2 } },
    ]);
  });

  it("accepts spaces, dots and a book number", () => {
    expect(parseScriptureReference("2. Kor 5, 17")?.book).toBe("2Cor");
    expect(parseScriptureReference("Ap.Csel. 2")?.book).toBe("Acts");
    expect(parseScriptureReference("1Móz 1,1–5")?.book).toBe("Gen");
    expect(parseScriptureReference("Song of Songs 2:1")?.book).toBe("Song");
    expect(parseScriptureReference(" Jn 3,16. ")?.ranges).toHaveLength(1);
  });

  it.each([
    "Prayer",
    "",
    "3:16",
    "Break 2",
    "Song 1",
    "Ének 4",
    "Offering for the 2 missions",
    "Jn 3,21-16",
    "Jn 4-3",
    "Jn 0",
    "Jn 3,1-2-3",
    "Jn 3:1:2",
    "Jn 999",
  ])("refuses %j", (text) => {
    expect(parseScriptureReference(text)).toBeNull();
  });
});

describe("referenceStyle and formatVerses", () => {
  it("writes the verses in the style of the typed reference", () => {
    const hungarian = referenceStyle("1 Kor 13,1-3")!;
    expect(hungarian).toEqual({ book: "1 Kor", english: false });
    const verses = [
      { chapter: 13, verse: 1 },
      { chapter: 13, verse: 2 },
      { chapter: 13, verse: 3 },
      { chapter: 13, verse: 7 },
      { chapter: 14, verse: 1 },
    ];
    expect(formatVerses(hungarian, verses)).toBe("1 Kor 13,1–3.7; 14,1");
    expect(formatVerses(referenceStyle("1 Cor. 13:1")!, verses)).toBe("1 Cor. 13:1–3,7; 14:1");
    expect(referenceStyle("Prayer")).toBeNull();
    expect(
      formatVerses(referenceStyle("Jn 21,25")!, [
        { chapter: 21, verse: 25 },
        { chapter: 1, verse: 1, book: "Acts" },
      ]),
    ).toBe("Jn 21,25; ApCsel 1,1");
  });
});
