import { parseChordPro } from "@/lib/music/chordpro";
import type { BeatGrid } from "@/lib/music/live/beat-grid";
import { clampBpm } from "@/lib/music/metronome/beat-clock";
import { meterOf } from "@/lib/music/metronome/meter";

// The tempo for the mixer where there is no metronome, e.g. in the projection
// controller: the leader's grid in a live session, or else the `{tempo}` and
// `{time}` of the chart of the song on the screens.

type ChartTempo = { bpm: number | null; timeSignature: string | null };

/**
 * The tempo of a chart as the arrangement reads it (`tempo_bpm` and
 * `time_signature`, the migration `arrangement_metadata`), so the projection
 * and the sheet agree: the first `{tempo}` with 1 to 3 digits, and the first
 * `{time}` such as 6/8. In compound time, the tempo counts dotted beats.
 * The projection sources have only the chart, not these columns.
 */
export function chartTempo(chordpro: string): ChartTempo {
  const { meta } = parseChordPro(chordpro);
  const valid = /^[0-9]{1,3}$/.test(meta.tempo ?? "") && Number(meta.tempo) > 0;
  const time = meta.time ?? "";
  return {
    bpm: valid ? clampBpm(Number(meta.tempo)) : null,
    timeSignature: /^[0-9]{1,2}\/[0-9]{1,2}$/.test(time) ? time : null,
  };
}

/**
 * The tempo of the leader's grid, or else of the chart. The grid does not say
 * how the leader counts compound time: its beats per bar tell it.
 */
export function mixerTempoOf(
  chart: ChartTempo | null,
  grid: BeatGrid | null,
): { bpm: number | null; quarterNotesPerBeat: number } {
  if (!grid)
    return {
      bpm: chart?.bpm ?? null,
      quarterNotesPerBeat: meterOf(chart?.timeSignature, "dotted")?.quarterNotesPerBeat ?? 1,
    };
  for (const compoundBeat of ["dotted", "eighth"] as const) {
    const meter = meterOf(chart?.timeSignature, compoundBeat);
    if (meter?.beatsPerBar === grid.beatsPerBar)
      return { bpm: grid.bpm, quarterNotesPerBeat: meter.quarterNotesPerBeat };
  }
  return { bpm: grid.bpm, quarterNotesPerBeat: 1 };
}
