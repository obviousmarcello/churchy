// With the metronome, a score plays on its beats. These functions put a
// place in the score (in quarter notes from its start) on the beats of the
// metronome's bar.

/** Quarter notes that count as the same place: the times of a score are sums of fractions. */
const EPSILON = 1e-6;

/**
 * Where the playback from `from` starts with the metronome: `beat`, the start
 * of the beat that has `from`, and `barBeat`, the beat of the metronome's bar
 * (from 0) that plays it. `bars` has the start of each bar of the score. A
 * first bar that is shorter than the others (a pickup) ends on the last beat
 * of the bar. When the bars of the score are not as long as the metronome's,
 * the playback starts on a beat, not always on the same beat of the bar.
 */
export function startBeat(
  bars: readonly number[],
  from: number,
  beatsPerBar: number,
  quarterNotesPerBeat: number,
): { beat: number; barBeat: number } {
  const barIndex = bars.findLastIndex((start) => start <= from + EPSILON);
  const barStart = barIndex >= 0 ? bars[barIndex] : 0;
  let offset = from - barStart!;
  const barLength = beatsPerBar * quarterNotesPerBeat;
  const firstLength = bars.length > 1 ? bars[1]! - bars[0]! : barLength;
  if (barIndex === 0 && firstLength < barLength - EPSILON) offset += barLength - firstLength;

  const beatInBar = Math.floor(offset / quarterNotesPerBeat + EPSILON);
  return {
    beat: from - (offset - beatInBar * quarterNotesPerBeat),
    barBeat: ((beatInBar % beatsPerBar) + beatsPerBar) % beatsPerBar,
  };
}
