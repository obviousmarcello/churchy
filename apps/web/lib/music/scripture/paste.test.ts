import { describe, expect, it } from "vitest";

import { parsePastedVerses } from "./paste";
import { parseScriptureReference } from "./reference";

function parse(text: string, reference: string, max = 331) {
  return parsePastedVerses(text, parseScriptureReference(reference)!, max);
}

describe("parsePastedVerses", () => {
  it("splits the text at the verse numbers, with or without a space", () => {
    expect(parse("16 Lorem ipsum. 17Dolor sit amet. 18 Consectetur.", "Jn 3,16-18")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 16, text: "Lorem ipsum." },
        { chapter: 3, verse: 17, text: "Dolor sit amet." },
        { chapter: 3, verse: 18, text: "Consectetur." },
      ],
    });
  });

  it("keeps a number that is not the next verse in the text", () => {
    expect(parse("16 Lorem 12 ipsum. 17 Dolor 3 sit.", "Jn 3,16-17")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 16, text: "Lorem 12 ipsum." },
        { chapter: 3, verse: 17, text: "Dolor 3 sit." },
      ],
    });
  });

  it("reads a whole chapter and goes on in the next chapter", () => {
    expect(parse("1 Lorem. 2 Ipsum. 3 Dolor.", "Jn 3")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 1, text: "Lorem." },
        { chapter: 3, verse: 2, text: "Ipsum." },
        { chapter: 3, verse: 3, text: "Dolor.", chapterEnd: true },
      ],
    });
    expect(parse("35 Lorem. 36 Ipsum. 1 Dolor. 2 Sit.", "Jn 3,35–4,2")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 35, text: "Lorem." },
        { chapter: 3, verse: 36, text: "Ipsum.", chapterEnd: true },
        { chapter: 4, verse: 1, text: "Dolor." },
        { chapter: 4, verse: 2, text: "Sit." },
      ],
    });
  });

  it("leaves out the text after the last verse of the reference", () => {
    expect(parse("15 Lorem. 16 Ipsum. 17 Dolor. 18 Sit. 19 Amet.", "Jn 3,16-17")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 16, text: "Ipsum." },
        { chapter: 3, verse: 17, text: "Dolor." },
      ],
    });
    expect(parse("16 Lorem. 17 Ipsum. 18 Dolor. 19 Sit.", "Jn 3,16.18")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 16, text: "Lorem." },
        { chapter: 3, verse: 18, text: "Dolor." },
      ],
    });
  });

  it("keeps a number like the first verse of the next chapter in the text", () => {
    expect(parse("35 Lorem 1 Mózes. 36 Ipsum. 1 Dolor. 2 Sit.", "Jn 3,35–4,2")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 35, text: "Lorem 1 Mózes." },
        { chapter: 3, verse: 36, text: "Ipsum.", chapterEnd: true },
        { chapter: 4, verse: 1, text: "Dolor." },
        { chapter: 4, verse: 2, text: "Sit." },
      ],
    });
  });

  it("keeps the lines of a poem that look like headings", () => {
    const copy =
      "1 Boldog az az ember,\naki nem jár\nés nem ül a székre\n2 hanem az ÚR törvényében\ngyönyörködik";
    expect(parse(copy, "Zsolt 1,1-2")).toEqual({
      status: "ok",
      verses: [
        { chapter: 1, verse: 1, text: "Boldog az az ember, aki nem jár és nem ül a székre" },
        { chapter: 1, verse: 2, text: "hanem az ÚR törvényében gyönyörködik" },
      ],
    });
  });

  it("reads the verses of separate groups", () => {
    expect(parse("16 Lorem. 18 Ipsum.", "Jn 3,16.18")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 16, text: "Lorem." },
        { chapter: 3, verse: 18, text: "Ipsum." },
      ],
    });
  });

  it("takes a text without numbers as the one verse of the reference", () => {
    expect(parse("Lorem ipsum dolor.", "Jn 3,16")).toEqual({
      status: "ok",
      verses: [{ chapter: 3, verse: 16, text: "Lorem ipsum dolor." }],
    });
  });

  it("removes the reference lines, the footnote marks and the superscript numbers", () => {
    expect(
      parse("János 3,16-17\n¹⁶Lorem* ipsum.[a]\n¹⁷Dolor sit.\nJn 3:16-17 RÚF", "Jn 3,16-17"),
    ).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 16, text: "Lorem ipsum." },
        { chapter: 3, verse: 17, text: "Dolor sit." },
      ],
    });
  });

  it("reads the copy of a chapter of bible.com", () => {
    const copy =
      "János 3\n3\nLorem ipsum\n1Lorem dolor. 2Ipsum sit amet,\nconsectetur adipiscing.\nDolor sit amet\n3Consectetur.\n";
    expect(parse(copy, "Jn 3")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 1, text: "Lorem dolor." },
        { chapter: 3, verse: 2, text: "Ipsum sit amet, consectetur adipiscing." },
        { chapter: 3, verse: 3, text: "Consectetur.", chapterEnd: true },
      ],
    });
  });

  it("reads two chapters of bible.com one after the other", () => {
    const copy = "János 3\n3\n35Lorem. 36Ipsum.\nJános 4\n4\nDolor sit\n1Amet. 2Consectetur.";
    expect(parse(copy, "Jn 3,35–4,2")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 35, text: "Lorem." },
        { chapter: 3, verse: 36, text: "Ipsum.", chapterEnd: true },
        { chapter: 4, verse: 1, text: "Amet." },
        { chapter: 4, verse: 2, text: "Consectetur." },
      ],
    });
  });

  it("reads the copy with brackets, a reference line, a link and quotes", () => {
    const copy =
      "“[16] Lorem ipsum. [17] Dolor sit.”\nJános 3:16-17 RÚF\n\nhttps://bible.com/bible/920/jhn.3.16-17.RÚF";
    expect(parse(copy, "Jn 3,16-17")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 16, text: "Lorem ipsum." },
        { chapter: 3, verse: 17, text: "Dolor sit." },
      ],
    });
    expect(parse("“Lorem ipsum.”\nJános 3:16 RÚF", "Jn 3,16")).toEqual({
      status: "ok",
      verses: [{ chapter: 3, verse: 16, text: "Lorem ipsum." }],
    });
  });

  it("reads the copy of szentiras.eu, without the cross-references", () => {
    const copy =
      "Jn 3,16-17\nHelyek megtekintése\n16Lorem ipsum. (1Jn 4,9) 17Dolor (ez azt jelenti: 3 nap) sit.\n* * *\nKNB SZIT RUF\nIgés kártya";
    expect(parse(copy, "Jn 3,16-17")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 16, text: "Lorem ipsum." },
        { chapter: 3, verse: 17, text: "Dolor (ez azt jelenti: 3 nap) sit." },
      ],
    });
  });

  it("reads the copy of abibliamindenkie.hu, without the cross-references", () => {
    const copy =
      "5 Lorem ipsum. Ez 36,25-27; Ef 5,26; Tit 3,5\n6 Dolor sit.\nLorem heading\n7 Amet.";
    expect(parse(copy, "Jn 3,5-7")).toEqual({
      status: "ok",
      verses: [
        { chapter: 3, verse: 5, text: "Lorem ipsum." },
        { chapter: 3, verse: 6, text: "Dolor sit." },
        { chapter: 3, verse: 7, text: "Amet." },
      ],
    });
  });

  it("tells the first verse that the text does not have", () => {
    expect(parse("16 Lorem. 18 Ipsum.", "Jn 3,16-18")).toEqual({
      status: "missing",
      chapter: 3,
      verse: 17,
    });
    expect(parse("Lorem ipsum.", "Jn 3,16-18")).toEqual({
      status: "missing",
      chapter: 3,
      verse: 16,
    });
    expect(parse("16 17 Ipsum.", "Jn 3,16-17")).toEqual({
      status: "missing",
      chapter: 3,
      verse: 16,
    });
    expect(parse("35 Lorem. 36 Ipsum.", "Jn 3,35–4,2")).toEqual({
      status: "missing",
      chapter: 4,
      verse: 1,
    });
    expect(parse("  \n ", "Jn 3,16")).toEqual({ status: "empty" });
  });

  it("refuses more verses than the cache can keep for the book", () => {
    expect(parse("1 Lorem. 2 Ipsum. 3 Dolor.", "Jn 3,1-3", 2)).toEqual({
      status: "tooMany",
      count: 3,
      max: 2,
    });
  });
});
