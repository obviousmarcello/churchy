import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  /** Rows that `maybeSingle()` returns, in call order. */
  results: [] as unknown[],
  /** The values of each `update()` call. */
  updates: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/music/auth", () => ({
  requireSongAdmin: vi.fn(async () => undefined),
  requireUser: vi.fn(async () => undefined),
}));
vi.mock("@/server/music/db", () => ({
  getMusicSupabase: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      update: (values: unknown) => {
        supabase.updates.push(values);
        return query;
      },
      maybeSingle: async () => ({ data: supabase.results.shift() ?? null, error: null }),
    };
    return { from: () => query };
  },
}));

import { CHORDPRO_MAX_LENGTH, arrangementInputSchema, updateArrangement } from "./arrangements";

const ID = "6f1c2b0e-8a4d-4c3e-9b7a-1d2e3f4a5b6c";

function row(chordpro: string, sectionOrder: string[] = []) {
  return {
    id: ID,
    song_id: "0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
    name: "Default",
    is_default: true,
    musical_key: null,
    other_keys: [],
    chord_notation: "english",
    tempo_bpm: null,
    time_signature: null,
    duration_seconds: null,
    projection_theme_id: null,
    chordpro,
    section_order: sectionOrder,
  };
}

describe("arrangementInputSchema", () => {
  it("converts plain section headers on save", () => {
    const result = arrangementInputSchema.parse({
      name: "Default",
      chordpro: "VERSE 1\n[D]Line one\n\nCHORUS\n[G]Line two",
    });

    expect(result.chordpro).toBe(
      "{start_of_verse: Verse 1}\n[D]Line one\n{end_of_verse}\n\n{start_of_chorus: Chorus}\n[G]Line two\n{end_of_chorus}",
    );
  });

  it("checks the section order against the converted sections", () => {
    const result = arrangementInputSchema.parse({
      name: "Default",
      chordpro: "VERSE 1\nLine one\n\nCHORUS\nLine two",
      sectionOrder: ["verse 1", "CHORUS", "Verse 1"],
    });

    expect(result.sectionOrder).toEqual(["Verse 1", "Chorus", "Verse 1"]);
  });

  it("converts the chart before it writes the metadata", () => {
    const result = arrangementInputSchema.parse({
      name: "Default",
      chordpro: "VERSE 1\nLine one",
      key: "G",
      bpm: 72,
    });

    expect(result.chordpro).toBe(
      "{key: G}\n{tempo: 72}\n{start_of_verse: Verse 1}\nLine one\n{end_of_verse}",
    );
  });

  it("converts the headers of a chart with directives and ChordPro sections", () => {
    const result = arrangementInputSchema.parse({
      name: "Default",
      chordpro:
        "{tempo: 74}\n{start_of_verse: Verse 1}\nLine one\n{end_of_verse}\nCHORUS\nLine two",
      key: "D",
      sectionOrder: ["Verse 1", "Chorus"],
    });

    expect(result).toMatchObject({
      chordpro:
        "{tempo: 74}\n{key: D}\n{start_of_verse: Verse 1}\nLine one\n{end_of_verse}\n{start_of_chorus: Chorus}\nLine two\n{end_of_chorus}",
      sectionOrder: ["Verse 1", "Chorus"],
    });
  });

  it("keeps a chart without section headers", () => {
    const chordpro = "[D]Line one\nLine two";

    expect(arrangementInputSchema.parse({ name: "Default", chordpro }).chordpro).toBe(chordpro);
  });

  it("gives the same chart when it saves a converted chart again", () => {
    const first = arrangementInputSchema.parse({
      name: "Default",
      chordpro: "VERSE 1\nLine one\n\nCHORUS\nLine two",
    });
    const second = arrangementInputSchema.parse({ name: "Default", chordpro: first.chordpro });

    expect(second.chordpro).toBe(first.chordpro);
  });

  it("puts chord lines above the lyrics into the lyrics on save", () => {
    const result = arrangementInputSchema.parse({
      name: "Default",
      chordpro: "VERSE 1\nG       C\nAmazing grace",
      sectionOrder: ["Verse 1"],
    });

    expect(result.chordpro).toBe("{start_of_verse: Verse 1}\n[G]Amazing [C]grace\n{end_of_verse}");
  });

  it("keeps chord lines as written with keepPlainSections", () => {
    const chordpro = "G       C\nAmazing grace";
    const result = arrangementInputSchema.parse({
      name: "Default",
      chordpro,
      keepPlainSections: true,
    });

    expect(result.chordpro).toBe(chordpro);
  });

  it("keeps plain headers as lyrics with keepPlainSections", () => {
    const chordpro = "VERSE 1\nLine one\nBridge";
    const result = arrangementInputSchema.parse({
      name: "Default",
      chordpro,
      keepPlainSections: true,
    });

    expect(result).toEqual({ name: "Default", chordpro, sectionOrder: [] });
  });

  it("rejects a chart that the conversion makes too long", () => {
    const section = "VERSE 1\nLine one\n\n";
    const body = "x".repeat(CHORDPRO_MAX_LENGTH - section.length * 10);
    const chordpro = section.repeat(10) + body;

    expect(chordpro.length).toBeLessThanOrEqual(CHORDPRO_MAX_LENGTH);
    const result = arrangementInputSchema.safeParse({ name: "Default", chordpro });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["chordpro"]]);
  });
});

describe("updateArrangement", () => {
  beforeEach(() => {
    supabase.results = [];
    supabase.updates = [];
  });

  it("keeps the stored chart when only other fields change", async () => {
    const stored = "VERSE 1\nLine one\nBridge";
    supabase.results.push(row(stored), row(stored));

    await updateArrangement(ID, { name: "Renamed" });

    expect(supabase.updates).toEqual([{ name: "Renamed", chordpro: stored, section_order: [] }]);
  });

  it("converts a new chart in the patch", async () => {
    supabase.results.push(row(""), row(""));

    await updateArrangement(ID, { chordpro: "[Chorus]\nLine one", sectionOrder: ["chorus"] });

    expect(supabase.updates).toEqual([
      {
        name: "Default",
        chordpro: "{start_of_chorus: Chorus}\nLine one\n{end_of_chorus}",
        section_order: ["Chorus"],
      },
    ]);
  });

  it("keeps the plain headers of a new chart with keepPlainSections", async () => {
    supabase.results.push(row(""), row(""));

    await updateArrangement(ID, { chordpro: "[Chorus]\nLine one", keepPlainSections: true });

    expect(supabase.updates).toEqual([
      { name: "Default", chordpro: "[Chorus]\nLine one", section_order: [] },
    ]);
  });

  it("writes the theme only when the patch has it", async () => {
    const theme = "0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6e";
    supabase.results.push(row(""), row(""), row(""), row(""));

    await updateArrangement(ID, { themeId: theme });
    await updateArrangement(ID, { themeId: null });

    expect(supabase.updates).toEqual([
      { name: "Default", chordpro: "", section_order: [], projection_theme_id: theme },
      { name: "Default", chordpro: "", section_order: [], projection_theme_id: null },
    ]);
  });
});

describe("other keys and note names", () => {
  function parse(input: Record<string, unknown>) {
    return arrangementInputSchema.safeParse({ name: "Default", chordpro: "[G]Hello", ...input });
  }

  it("writes the other keys without repeats and without the key of the chart", () => {
    const result = parse({ key: "G", otherKeys: ["E", "G", "A", "E"] });
    expect(result.success && result.data.chordpro).toBe("{key: G}\n{x_other_keys: E, A}\n[G]Hello");
  });

  it("removes the other keys with an empty list", () => {
    const result = parse({ chordpro: "{key: G}\n{x_other_keys: E}\n[G]Hello", otherKeys: [] });
    expect(result.success && result.data.chordpro).toBe("{key: G}\n[G]Hello");
  });

  it("needs a key of the chart and the same mode", () => {
    expect(parse!({ otherKeys: ["E"] }).error?.issues[0]!.path).toEqual(["otherKeys"]);
    expect(parse!({ key: "G", otherKeys: ["A", "Em"] }).error?.issues[0]!.path).toEqual([
      "otherKeys",
      1,
    ]);
  });

  it("reads the keys in the note names of the chart", () => {
    const result = parse({
      chordpro: "[F]Hello [B]world",
      key: "F",
      otherKeys: ["B", "Bb"],
      notation: "german",
    });
    expect(result.success && result.data.chordpro).toBe(
      "{key: F}\n{x_notation: german}\n{x_other_keys: B}\n[F]Hello [B]world",
    );
  });

  it("writes the notation only when the chords do not show it", () => {
    const shown = parse({ chordpro: "[H7]Hello", notation: "german" });
    expect(shown.success && shown.data.chordpro).toBe("[H7]Hello");
    const english = parse({ chordpro: "{x_notation: german}\n[G]Hello", notation: "english" });
    expect(english.success && english.data.chordpro).toBe("[G]Hello");
  });
});
