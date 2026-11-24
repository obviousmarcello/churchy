import { clampBpm } from "./beat-clock";
import { meterOf, type CompoundBeat } from "./meter";

// The tempo and the beats of a bar follow the song on the screen. The user can
// change them for that song; the next song sets its own values again. A song
// without a tempo or a time signature keeps the current value.

export const DEFAULT_BPM = 100;
export const DEFAULT_BEATS_PER_BAR = 4;

export type TempoSong = {
  id: string;
  bpm: number | null;
  timeSignature: string | null;
};

export type SongTempo = {
  /** The song the values belong to. Undefined before the first song, null for no song. */
  songId?: string | null;
  compoundBeat?: CompoundBeat;
  bpm: number;
  beatsPerBar: number;
  /**
   * The user set the tempo for this song. Without it, the tempo is the song's
   * own, or the tempo of an earlier song: not one to save into this song.
   */
  edited?: boolean;
  /**
   * The tempo and the time signature of the song when the values were taken.
   * When the data of the same song changes (e.g. fresh data replaces the
   * browser copy), the values follow, unless the user edited them.
   */
  source?: { bpm: number | null; timeSignature: string | null };
};

export const INITIAL_SONG_TEMPO: SongTempo = {
  bpm: DEFAULT_BPM,
  beatsPerBar: DEFAULT_BEATS_PER_BAR,
};

/**
 * The beats of the metronome in one beat of the song's tempo. The chart's
 * tempo (`{tempo}`) counts dotted quarter notes in compound time (6/8, 9/8,
 * 12/8), so all devices read and save the same tempo: 3 when this device
 * counts eighth notes there, else 1.
 */
export function tempoScale(
  timeSignature: string | null | undefined,
  compoundBeat: CompoundBeat,
): number {
  return compoundBeat === "eighth" && meterOf(timeSignature, compoundBeat)?.compound ? 3 : 1;
}

/** The same object when nothing changes. */
export function followSong(
  state: SongTempo,
  song: TempoSong | null,
  compoundBeat: CompoundBeat,
): SongTempo {
  const songId = song?.id ?? null;
  const source = { bpm: song?.bpm ?? null, timeSignature: song?.timeSignature ?? null };
  const sourceChanged =
    state.songId === songId &&
    !state.edited &&
    state.source !== undefined &&
    (state.source.bpm !== source.bpm || state.source.timeSignature !== source.timeSignature);
  if (state.songId === songId && state.compoundBeat === compoundBeat && !sourceChanged)
    return state;

  const meter = meterOf(song?.timeSignature, compoundBeat);
  const beatsPerBar = meter?.beatsPerBar ?? state.beatsPerBar;
  const scale = tempoScale(song?.timeSignature, compoundBeat);
  // A new way to count compound time changes the beats, not the speed of the user's tempo.
  if (state.songId === songId && !sourceChanged) {
    const previousScale = tempoScale(song?.timeSignature, state.compoundBeat ?? compoundBeat);
    return {
      ...state,
      compoundBeat,
      beatsPerBar,
      bpm: clampBpm(Math.round((state.bpm * scale) / previousScale)),
    };
  }
  return {
    songId,
    compoundBeat,
    bpm: song?.bpm ? clampBpm(song.bpm * scale) : state.bpm,
    beatsPerBar,
    source,
  };
}
