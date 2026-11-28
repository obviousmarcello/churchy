import { describe, expect, it } from "vitest";

import { parseSnippet } from "./snippet";

const S = "\u0002";
const E = "\u0003";

describe("parseSnippet", () => {
  it("gives one plain part for text without marks", () => {
    expect(parseSnippet("Amazing grace, how sweet")).toEqual([
      { text: "Amazing grace, how sweet", match: false },
    ]);
  });

  it("splits the text at the marks", () => {
    expect(parseSnippet(`was ${S}blind${E} but now I ${S}see${E}`)).toEqual([
      { text: "was ", match: false },
      { text: "blind", match: true },
      { text: " but now I ", match: false },
      { text: "see", match: true },
    ]);
  });

  it("joins next matches", () => {
    expect(parseSnippet(`${S}amazing${E}${S}grace${E}`)).toEqual([
      { text: "amazinggrace", match: true },
    ]);
  });

  it("leaves out a mark without its pair", () => {
    expect(parseSnippet(`how ${S}sweet the sound`)).toEqual([
      { text: "how sweet the sound", match: false },
    ]);
    expect(parseSnippet(`how sweet${E} the ${S}sound${E}`)).toEqual([
      { text: "how sweet the ", match: false },
      { text: "sound", match: true },
    ]);
  });

  it("removes the line separators at the ends", () => {
    expect(parseSnippet(` / I once was ${S}lost${E} / `)).toEqual([
      { text: "I once was ", match: false },
      { text: "lost", match: true },
    ]);
  });

  it("gives no parts for empty text", () => {
    expect(parseSnippet("")).toEqual([]);
    expect(parseSnippet(" / ")).toEqual([]);
  });
});
