"use client";

import { useI18n } from "@/i18n/music/client";
import { chordSpelling, noteName } from "@/lib/music/chords/chord-name";
import { fromEnglish, type Notation } from "@/lib/music/chords/notation";
import type { KeysVoicing } from "@/lib/music/chords/keys";

const WHITE_WIDTH = 10;
const WHITE_HEIGHT = 44;
const BLACK_WIDTH = 6;
const BLACK_HEIGHT = 27;
/** The pitch classes of the white keys, in their order in an octave. */
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEYS = [1, 3, 6, 8, 10];
/** All diagrams show C3 to B5, so they line up. `keysVoicings` stays in it. */
const START = 48;
const OCTAVES = 3;
const WIDTH = OCTAVES * 7 * WHITE_WIDTH;
const KEYS = Array.from({ length: OCTAVES * 12 }, (_, index) => START + index);

const isBlack = (note: number) => BLACK_KEYS.includes(note % 12);

/** The left side of a key, from the start of the keyboard. */
function keyX(note: number) {
  const octave = Math.floor((note - START) / 12);
  const pitch = (note - START) % 12;
  const white = WHITE_KEYS.indexOf(pitch);
  if (white >= 0) return (octave * 7 + white) * WHITE_WIDTH;
  // A black key sits on the line after the white key under it.
  return (octave * 7 + WHITE_KEYS.indexOf(pitch - 1) + 1) * WHITE_WIDTH - BLACK_WIDTH / 2;
}

/**
 * A piano keyboard. A dot marks each key to play: the left hand's in a muted
 * color, the right hand's in the primary color. The names of the notes are under it.
 */
export function KeysDiagram({
  chord,
  voicing,
  notation,
}: {
  /** In English note names. */
  chord: string;
  voicing: KeysVoicing;
  /** The note names to show. */
  notation: Notation;
}) {
  const { m, format } = useI18n();
  const spelling = chordSpelling(chord);
  const names = (notes: number[], separator: string) =>
    notes.map((note) => fromEnglish(noteName(note, spelling)!, notation)).join(separator);

  function marker(note: number, hand: "left" | "right") {
    const black = isBlack(note);
    return (
      <circle
        key={`${hand}-${note}`}
        cx={keyX(note) + (black ? BLACK_WIDTH : WHITE_WIDTH) / 2}
        cy={black ? BLACK_HEIGHT - 5 : WHITE_HEIGHT - 6}
        r={black ? 2.4 : 3.2}
        strokeWidth={1}
        className={
          hand === "right"
            ? "fill-primary stroke-primary-contrast"
            : "fill-muted stroke-surface-raised"
        }
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <svg
        viewBox={`-1 -1 ${WIDTH + 2} ${WHITE_HEIGHT + 2}`}
        role="img"
        aria-label={format(m.sheet.rehearsal.keysDiagram, {
          chord: fromEnglish(chord, notation),
          notes: names([...voicing.left, ...voicing.right], ", "),
        })}
        className="w-full text-text"
      >
        {KEYS.filter((note) => !isBlack(note)).map((note) => (
          <rect
            key={note}
            x={keyX(note)}
            y={0}
            width={WHITE_WIDTH}
            height={WHITE_HEIGHT}
            rx={1}
            className="fill-surface"
            stroke="currentColor"
            strokeOpacity={0.5}
            strokeWidth={0.75}
          />
        ))}
        {KEYS.filter(isBlack).map((note) => (
          <rect
            key={note}
            x={keyX(note)}
            y={0}
            width={BLACK_WIDTH}
            height={BLACK_HEIGHT}
            rx={1}
            fill="currentColor"
          />
        ))}
        {voicing.left.map((note) => marker(note, "left"))}
        {voicing.right.map((note) => marker(note, "right"))}
      </svg>
      {/* Screen readers read the notes in the label of the diagram. */}
      <dl
        aria-hidden
        className="grid grid-cols-[auto_1fr] items-center gap-x-2 text-xs text-text/70"
      >
        <dt className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-surface-sunken" />
          {m.sheet.rehearsal.leftHand}
        </dt>
        <dd className="font-mono">{names(voicing.left, " ")}</dd>
        <dt className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" />
          {m.sheet.rehearsal.rightHand}
        </dt>
        <dd className="font-mono">{names(voicing.right, " ")}</dd>
      </dl>
    </div>
  );
}
