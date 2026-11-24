import { describe, expect, it } from "vitest";

import { firstSyllable } from "./syllable";

function syllable(text: string) {
  const found = firstSyllable(text);
  return found && text.slice(found.start, found.end);
}

describe("firstSyllable", () => {
  it("finds the first syllable of English words", () => {
    expect(syllable("Amazing grace")).toBe("A");
    expect(syllable("mazing grace")).toBe("ma");
    // A silent "e" counts as a vowel.
    expect(syllable("grace, how sweet")).toBe("gra");
    expect(syllable("Hallelujah")).toBe("Hal");
    expect(syllable("Jesus")).toBe("Je");
    expect(syllable("mother")).toBe("mo");
    expect(syllable("don't")).toBe("don't");
  });

  it("finds the first syllable of Hungarian words", () => {
    expect(syllable("Áldott")).toBe("Ál");
    expect(syllable("kegyelem")).toBe("ke");
    expect(syllable("Szent vagy")).toBe("Szent");
    expect(syllable("gyermek")).toBe("gyer");
    expect(syllable("nagy")).toBe("nagy");
    expect(syllable("őrzőm")).toBe("őr");
  });

  it("reads y as a vowel or as a consonant", () => {
    expect(syllable("my")).toBe("my");
    expect(syllable("yes")).toBe("yes");
    expect(syllable("glory")).toBe("glo");
    expect(syllable("mercy")).toBe("mer");
    expect(syllable("hely")).toBe("hely");
  });

  it("does not go past the end of the text", () => {
    expect(syllable("le")).toBe("le");
    expect(syllable("lu")).toBe("lu");
  });

  it("skips spaces and punctuation before the word", () => {
    expect(firstSyllable("  (Oh) yes")).toEqual({ start: 3, end: 5 });
    expect(syllable("„Uram")).toBe("U");
  });

  it("keeps combining marks with their letter", () => {
    expect(syllable("Áldott")).toBe("Ál");
  });

  it("gives null without letters", () => {
    expect(firstSyllable("")).toBeNull();
    expect(firstSyllable("   ")).toBeNull();
    expect(firstSyllable("- la")).toBeNull();
    expect(firstSyllable("123")).toBeNull();
  });
});
