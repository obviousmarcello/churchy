// The beats of a bar, from a song's time signature (for example "3/4" or "6/8").

/**
 * How to count compound time (6/8, 9/8, 12/8): with dotted quarter notes as
 * the beat (6/8 has 2 beats), or with eighth notes (6/8 has 6 beats). The
 * song's tempo always counts dotted quarter notes (see `tempoScale()`).
 */
export type CompoundBeat = "dotted" | "eighth";

export type TimeSignature = { numerator: number; denominator: number };

export type Meter = {
  beatsPerBar: number;
  /** 6/8, 9/8, 12/8 and similar: the beat has 3 parts. */
  compound: boolean;
  /** The length of a beat in quarter notes: 1 in 4/4, 2 in 2/2, 1.5 in 6/8 with dotted beats. */
  quarterNotesPerBeat: number;
};

const NOTE_VALUES = [1, 2, 4, 8, 16, 32];

/** Reads "4/4", "6/8", "C" (4/4) and "C|" or "¢" (2/2). Null for anything else. */
export function parseTimeSignature(text: string | null | undefined): TimeSignature | null {
  const value = text?.trim() ?? "";
  if (value.toUpperCase() === "C") return { numerator: 4, denominator: 4 };
  if (value.toUpperCase() === "C|" || value === "¢") return { numerator: 2, denominator: 2 };
  const match = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(value);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (numerator < 1 || !NOTE_VALUES.includes(denominator)) return null;
  return { numerator, denominator };
}

/** Null when the text is not a time signature. */
export function meterOf(text: string | null | undefined, compoundBeat: CompoundBeat): Meter | null {
  const signature = parseTimeSignature(text);
  if (!signature) return null;
  const { numerator, denominator } = signature;
  const compound = denominator >= 8 && numerator > 3 && numerator % 3 === 0;
  const dotted = compound && compoundBeat === "dotted";
  return {
    beatsPerBar: dotted ? numerator / 3 : numerator,
    compound,
    quarterNotesPerBeat: ((dotted ? 3 : 1) * 4) / denominator,
  };
}
