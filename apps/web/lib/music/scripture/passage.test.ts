import { describe, expect, it } from "vitest";

import { MAX_PASSAGE_VERSES, resolvePassage } from "./passage";
import { parseScriptureReference } from "./reference";

const BOOK = {
  chapters: [
    ["a1", "a2", "a3"],
    ["b1", "", "b3"],
  ],
};

function passage(text: string) {
  return resolvePassage(parseScriptureReference(text)!, BOOK);
}

describe("resolvePassage", () => {
  it("gives the verses of the ranges in order, each once", () => {
    expect(passage("Jn 1,2-2,1; 1,3")).toEqual({
      verses: [
        { chapter: 1, verse: 2, text: "a2" },
        { chapter: 1, verse: 3, text: "a3" },
        { chapter: 2, verse: 1, text: "b1" },
      ],
      missing: false,
      truncated: false,
    });
  });

  it("gives whole chapters and leaves out the verses without text", () => {
    expect(passage("Jn 2").verses.map((verse) => verse.text)).toEqual(["b1", "b3"]);
    expect(passage("Jn 2").missing).toBe(true);
  });

  it("marks the verses and the chapters that the book does not have", () => {
    expect(passage("Jn 1,2-5")).toEqual({
      verses: [
        { chapter: 1, verse: 2, text: "a2" },
        { chapter: 1, verse: 3, text: "a3" },
      ],
      missing: true,
      truncated: false,
    });
    expect(passage("Jn 3")).toEqual({ verses: [], missing: true, truncated: false });
  });

  it("stops at the largest passage", () => {
    const long = { chapters: [Array.from({ length: 200 }, (_, index) => `v${index}`), ["x"]] };
    const result = resolvePassage(parseScriptureReference("Ps 1-2")!, long);
    expect(result.verses).toHaveLength(MAX_PASSAGE_VERSES);
    expect(result.truncated).toBe(true);
    expect(result.missing).toBe(false);
  });
});
