import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { matchDirective, parseChordPro, parseChordProSections } from "./chordpro";
import { convertPlainSections } from "./chordpro-import";
import { explicitNotation } from "./chords/notation";

// The regular expression before `matchDirective`. It backtracks exponentially, so only short lines go in.
const OLD_DIRECTIVE = /^\{\s*([a-z_]+)(?:\s*[:\s]\s*(.*?))?\s*\}$/i;

function oldMatch(line: string) {
  const match = OLD_DIRECTIVE.exec(line.trim());
  return match ? { name: match[1], value: match[2]?.trim() ?? "" } : null;
}

function timed(run: () => void) {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("matchDirective", () => {
  it.each([
    ["{start_of_verse}", { name: "start_of_verse", value: "" }],
    ["{start_of_verse: Verse 1}", { name: "start_of_verse", value: "Verse 1" }],
    ["  { sov   Verse 1 }  ", { name: "sov", value: "Verse 1" }],
    ['{start_of_verse label="Verse 1"}', { name: "start_of_verse", value: 'label="Verse 1"' }],
    ["{title:}", { name: "title", value: "" }],
    ["{c : : x}", { name: "c", value: ": x" }],
    ["{Title: a}}", { name: "Title", value: "a}" }],
    ["{x-y}", null],
    ["{}", null],
    ["{ : x}", null],
    ["text {title: a}", null],
  ])("reads %j", (line, expected) => {
    expect(matchDirective(line)).toEqual(expected);
  });

  it("gives the same result as the old regular expression", () => {
    const char = fc.constantFrom(
      "{",
      "}",
      ":",
      " ",
      "\t",
      "\r",
      "a",
      "B",
      "_",
      "-",
      "x",
      "=",
      '"',
      "1",
    );
    const line = fc.array(char, { maxLength: 14 }).map((chars) => chars.join(""));
    const directiveLike = fc
      .tuple(fc.constantFrom("{", " {"), line, fc.constantFrom("}", "} ", ""))
      .map(([open, inside, close]) => open + inside + close);

    fc.assert(
      fc.property(fc.oneof(line, directiveLike), (text) => {
        expect(matchDirective(text)).toEqual(oldMatch(text));
      }),
      { numRuns: 5000 },
    );
  });
});

describe("linear time on hostile lines", () => {
  const n = 50_000;
  const lines = [
    "{a" + " ".repeat(n) + "x",
    "{a" + " ".repeat(n) + ":" + " ".repeat(n) + "x",
    "{x_notation:" + " ".repeat(n) + "x",
    "verse" + " ".repeat(n) + "x",
    "[verse" + " ".repeat(n) + ":" + " ".repeat(n) + "x",
    "Verse 1" + " ".repeat(n) + ":",
  ];

  it.each(lines.map((line, index) => [index, line]))(
    "line %i parses in under 100 ms",
    (_, line) => {
      const time = timed(() => {
        parseChordPro(line);
        parseChordProSections(line);
        convertPlainSections(line);
        explicitNotation(line);
      });
      expect(time).toBeLessThan(100);
    },
  );
});

describe("explicitNotation", () => {
  it("reads the directive", () => {
    expect(explicitNotation("{title: A}\n  { x_notation :  German }\n[H]a")).toBe("german");
    expect(explicitNotation("{x_notation:english}")).toBe("english");
    expect(explicitNotation("{x_notation: other}")).toBeNull();
    // As `public.chordpro_directive()`: white space with line breaks around the value, but no line break in it.
    expect(explicitNotation("{x_notation:\n german\n}")).toBe("german");
    expect(explicitNotation("{\nx_notation\n:german}")).toBe("german");
    expect(explicitNotation("{x_notation: ger\nman}\n{x_notation: german}")).toBe("german");
    // No-break spaces are not white space for the database.
    expect(explicitNotation("{x_notation:\u00a0german}")).toBeNull();
    expect(explicitNotation("[H]a")).toBeNull();
  });
});
