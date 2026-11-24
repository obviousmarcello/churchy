"use client";

import { useI18n } from "@/i18n/music/client";
import { noteName } from "@/lib/music/chords/chord-name";
import type { GuitarVoicing } from "@/lib/music/chords/guitar";
import { fromEnglish, type Notation } from "@/lib/music/chords/notation";

const FRETS = 5;
const LEFT = 28;
const TOP = 18;
const STRING_GAP = 14;
const FRET_GAP = 16;

/**
 * A chord diagram: the strings stand up, the lowest string at the left, the
 * nut (or the first fret of `baseFret`) at the top. Above the strings, "×" is
 * a muted string and "○" an open one. The names of the open strings are under it.
 */
export function GuitarDiagram({
  chord,
  voicing,
  tuning,
  notation,
}: {
  /** The name of the chord, in `notation`. */
  chord: string;
  voicing: GuitarVoicing;
  /** MIDI notes of the open strings, from the lowest. */
  tuning: readonly number[];
  /** The note names of the open strings. */
  notation: Notation;
}) {
  const { m, format } = useI18n();
  const { frets, barre, baseFret } = voicing;
  const right = LEFT + (tuning.length - 1) * STRING_GAP;
  const bottom = TOP + FRETS * FRET_GAP;
  const x = (string: number) => LEFT + string * STRING_GAP;
  const y = (fret: number) => TOP + (fret - baseFret + 0.5) * FRET_GAP;

  return (
    <svg
      viewBox={`0 0 ${right + 10} ${bottom + 16}`}
      role="img"
      aria-label={format(m.sheet.rehearsal.guitarDiagram, {
        chord,
        strings: frets.map((fret) => (fret === null ? "x" : fret)).join(" "),
      })}
      className="w-full max-w-36 text-text"
    >
      {/* The frets, and the nut as a thick line. */}
      {Array.from({ length: FRETS + 1 }, (_, index) => (
        <line
          key={index}
          x1={LEFT}
          x2={right}
          y1={TOP + index * FRET_GAP}
          y2={TOP + index * FRET_GAP}
          stroke="currentColor"
          strokeOpacity={index === 0 && baseFret === 1 ? 1 : 0.4}
          strokeWidth={index === 0 && baseFret === 1 ? 4 : 1}
          strokeLinecap="square"
        />
      ))}
      {tuning.map((_, string) => (
        <line
          key={string}
          x1={x(string)}
          x2={x(string)}
          y1={TOP}
          y2={bottom}
          stroke="currentColor"
          strokeOpacity={0.6}
        />
      ))}
      {baseFret > 1 && (
        <text x={LEFT - 6} y={y(baseFret) + 3.5} textAnchor="end" fontSize={9} fill="currentColor">
          {format(m.sheet.rehearsal.baseFret, { fret: baseFret })}
        </text>
      )}

      {barre && (
        <rect
          x={x(barre.from) - 5}
          y={y(barre.fret) - 5}
          width={x(barre.to) - x(barre.from) + 10}
          height={10}
          rx={5}
          className="fill-primary"
        />
      )}
      {frets.map((fret, string) =>
        fret === null ? (
          <text
            key={string}
            x={x(string)}
            y={TOP - 6}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
          >
            ×
          </text>
        ) : fret === 0 ? (
          <circle
            key={string}
            cx={x(string)}
            cy={TOP - 9}
            r={3.5}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
          />
        ) : barre && fret === barre.fret && string >= barre.from && string <= barre.to ? null : (
          <circle key={string} cx={x(string)} cy={y(fret)} r={5} className="fill-primary" />
        ),
      )}

      {tuning.map((open, string) => (
        <text
          key={string}
          x={x(string)}
          y={bottom + 12}
          textAnchor="middle"
          fontSize={8}
          fill="currentColor"
          fillOpacity={0.6}
        >
          {fromEnglish(noteName(open, "sharp")!, notation)}
        </text>
      ))}
    </svg>
  );
}
