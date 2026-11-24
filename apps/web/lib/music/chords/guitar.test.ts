import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { mod12, parseChordName } from "./chord-name";
import { GUITAR_POSITIONS, GUITAR_TUNINGS, guitarVoicings, type GuitarTuning } from "./guitar";

/** The first shape, written as guitarists write it, e.g. "x32010". */
function bestShape(symbol: string, tuning: GuitarTuning = "standard", position = 0) {
  const voicing = guitarVoicings(parseChordName(symbol)!, GUITAR_TUNINGS[tuning], position)[0];
  return voicing?.frets.map((fret) => (fret === null ? "x" : String(fret))).join("");
}

describe("guitarVoicings", () => {
  it("gives the common open shapes first in standard tuning", () => {
    expect(bestShape("C")).toBe("x32010");
    expect(["320003", "320033"]).toContain(bestShape("G"));
    expect(bestShape("D")).toBe("xx0232");
    expect(bestShape("Am")).toBe("x02210");
    expect(bestShape("E")).toBe("022100");
    expect(bestShape("Em")).toBe("022000");
    expect(bestShape("F")).toBe("133211");
    expect(bestShape("Bm")).toBe("x24432");
    expect(bestShape("Bb")).toBe("x13331");
    expect(bestShape("Cmaj7")).toBe("x32000");
  });

  it("marks the barre", () => {
    const [f] = guitarVoicings(parseChordName("F")!, GUITAR_TUNINGS.standard, 0);
    expect(f!.barre).toEqual({ fret: 1, from: 0, to: 5 });
    const [a] = guitarVoicings(parseChordName("A")!, GUITAR_TUNINGS.standard, 5);
    expect(a!.barre).toEqual({ fret: 5, from: 0, to: 5 });
  });

  it("uses the area of the neck of the position", () => {
    expect(bestShape("A", "standard", 5)).toBe("577655");
    const [a] = guitarVoicings(parseChordName("A")!, GUITAR_TUNINGS.standard, 5);
    expect(a!.baseFret).toBe(5);
  });

  it("plays the tonic chord of an open tuning on the open strings", () => {
    expect(bestShape("D", "openD")).toBe("000000");
    // The low D string would make it G/D.
    expect(bestShape("G", "openG")).toBe("x00000");
  });

  it("puts the slash bass lowest", () => {
    const shape = bestShape("G/B")!;
    expect(shape).toMatch(/^x2/);
  });

  it("gives only playable shapes that sound the chord", () => {
    const symbols = [
      "C",
      "Dm",
      "E7",
      "Fmaj7",
      "G/B",
      "Am7",
      "Bb",
      "C#m",
      "Ebsus4",
      "F#m7b5",
      "Gadd9",
      "Ab5",
      "Bdim",
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...symbols),
        fc.constantFrom<GuitarTuning>("standard", "openD", "openG"),
        fc.constantFrom(...GUITAR_POSITIONS),
        (symbol, tuning, position) => {
          const chord = parseChordName(symbol)!;
          const strings = GUITAR_TUNINGS[tuning];
          for (const { frets, barre } of guitarVoicings(chord, strings, position)) {
            const sounding = frets.flatMap((fret, string) =>
              fret === null ? [] : [strings[string]! + fret],
            );
            const pitches = new Set(sounding.map(mod12));
            expect(chord.required.every((pitch) => pitches.has(pitch))).toBe(true);
            // Without a slash bass, a shape may use another note of the chord in the bass when no other shape exists.
            if (chord.bass !== chord.root) expect(mod12(Math.min(...sounding))).toBe(chord.bass);
            else expect(pitches.has(mod12(Math.min(...sounding)))).toBe(true);

            const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
            if (fretted.length > 0)
              expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
            const fingers = barre
              ? 1 + fretted.filter((fret) => fret > barre.fret).length
              : fretted.length;
            expect(fingers).toBeLessThanOrEqual(4);
          }
        },
      ),
    );
  });
});

describe("guitarVoicings in every tuning and position", () => {
  it("finds a shape for the common chords", () => {
    const symbols = [
      "C",
      "D",
      "E",
      "F",
      "G",
      "A",
      "B",
      "Am",
      "Bm",
      "Em",
      "Dm",
      "F#m",
      "C#m",
      "G7",
      "D7",
      "Bb",
      "Eb",
    ];
    for (const tuning of ["standard", "openD", "openG"] as const) {
      for (const position of GUITAR_POSITIONS) {
        for (const symbol of symbols) {
          expect(
            guitarVoicings(parseChordName(symbol)!, GUITAR_TUNINGS[tuning], position),
            `${symbol} ${tuning} ${position}`,
          ).not.toHaveLength(0);
        }
      }
    }
  });
});
