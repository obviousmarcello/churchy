"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { contextTimeAt } from "@/lib/music/metronome/audio-clock";
import type { MetronomeEngine } from "@/lib/music/metronome/engine";
import { startBeat } from "@/lib/music/score/score-beats";
import type { ScoreNote } from "./score-worker";

// Rehearsal mode plays the notes of a score with simple generated tones, so a
// singer or player can hear the part. The notes light up while they sound.
//
// While the metronome plays, the notes play on its beats: at its tempo (also
// the leader's tempo in a live session), from the next bar line, or from the
// beat of the note to play from. Each beat of the metronome plans the notes
// of the next beat, so a new tempo comes in from the next beat. Without the
// metronome, the notes play at the score's own tempo, at `speed`.

/** A note of a score on the sheet, with its voice. */
export type PlayableNote = ScoreNote & {
  /** The staff and the voice in it, from 1, e.g. "2.1" for the first voice of the second staff. */
  voice: string;
};

/** The notes of a score on the sheet, and the start of each bar in quarter notes. */
export type PlayableTimeline = { notes: PlayableNote[]; bars: number[] };

/** The metronome that the notes follow. */
export type MetronomeSync = {
  engine: MetronomeEngine;
  /** The length of the metronome's beat in quarter notes: 1 in 4/4, 1.5 in 6/8 with dotted beats. */
  quarterNotesPerBeat: number;
};

/** The speeds of the playback without the metronome, as a share of the score's tempo. */
export const SCORE_SPEEDS = [0.5, 0.75, 1] as const;
export type ScoreSpeed = (typeof SCORE_SPEEDS)[number];

// Without the metronome: the tones start a moment after the button, so the
// first one is not cut. The scheduler plans the tones this far ahead, and runs this often.
const START_DELAY_S = 0.1;
const LOOKAHEAD_S = 0.3;
const SCHEDULE_INTERVAL_MS = 25;
const VOLUME = 0.12;
const ATTACK_S = 0.01;
const RELEASE_S = 0.04;
/** Quarter notes that count as the same place. */
const EPSILON = 1e-6;

type Session = { stop: () => void };

/**
 * The playback of one score at a time. `active` has the ids of the notes that
 * sound now, for the highlight on the sheet. `waiting`: the playback waits for
 * its first beat of the metronome.
 */
export function useScorePlayer() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  // The notes follow the metronome.
  const [synced, setSynced] = useState(false);
  const [active, setActive] = useState<string[]>([]);
  const session = useRef<Session | null>(null);

  const stop = useCallback(() => {
    session.current?.stop();
    session.current = null;
    setPlaying(null);
    setWaiting(false);
    setActive([]);
  }, []);

  /**
   * Plays the notes of `voices` (all with null) of the song `songId`, from
   * the note `from` (null: from the start). With `metronome`, on its beats;
   * else at `speed` of the score's tempo.
   */
  const play = useCallback(
    (
      songId: string,
      timeline: PlayableTimeline,
      options: {
        voices: string[] | null;
        from: PlayableNote | null;
        speed: ScoreSpeed;
        metronome: MetronomeSync | null;
      },
    ) => {
      const { voices, from, speed, metronome } = options;
      const notes = voices
        ? timeline.notes.filter((note) => voices.includes(note.voice))
        : timeline.notes;
      // Nothing to play: the old notes stop, and the sheet shows that nothing plays.
      if (notes.length === 0) return stop();
      session.current?.stop();

      function finish() {
        session.current = null;
        setPlaying(null);
        setWaiting(false);
        setActive([]);
      }
      setPlaying(songId);
      setSynced(metronome !== null);
      setWaiting(metronome !== null);
      session.current = metronome
        ? playWithMetronome(notes, timeline.bars, from?.beat ?? 0, metronome, {
            onStart: () => setWaiting(false),
            onActive: setActive,
            onEnd: finish,
          })
        : playAlone(notes, from?.time ?? 0, speed, { onActive: setActive, onEnd: finish });
    },
    [stop],
  );

  // Stop the tones when the sheet closes.
  useEffect(() => () => session.current?.stop(), []);

  return { playing, waiting, synced, active, play, stop };
}

let audioContext: AudioContext | null = null;

/** One context for the page. The browser starts it only after a click, which the play button is. */
function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext({ latencyHint: "interactive" });
  void audioContext.resume();
  return audioContext;
}

/** A gain for the tones of one playback, so a stop can fade them out. */
function openOutput(context: AudioContext): { output: GainNode; close: () => void } {
  const output = context.createGain();
  output.connect(context.destination);
  return {
    output,
    close() {
      // A short fade, so the stop does not click.
      output.gain.setTargetAtTime(0, context.currentTime, 0.01);
      setTimeout(() => output.disconnect(), 100);
    },
  };
}

/**
 * Plays the notes from the time `from` (in ms), at `speed` of the score's
 * tempo. `onActive` gets the ids of the notes that sound, each time they
 * change; `onEnd` runs after the last note.
 */
function playAlone(
  notes: ScoreNote[],
  from: number,
  speed: number,
  handlers: { onActive: (ids: string[]) => void; onEnd: () => void },
): Session {
  const chosen = notes
    .filter((note) => note.time >= from)
    .map((note) => ({ ...note, time: note.time - from }));
  const context = getAudioContext();
  const { output, close } = openOutput(context);
  const start = context.currentTime + START_DELAY_S;
  const at = (ms: number) => start + ms / 1000 / speed;
  const end = Math.max(0, ...chosen.map((note) => note.time + note.duration));

  let next = 0;
  function schedule() {
    while (next < chosen.length && at(chosen[next]!.time) < context.currentTime + LOOKAHEAD_S) {
      const note = chosen[next++];
      tone(context, output, note!.pitch, at(note!.time), at(note!.time + note!.duration));
    }
  }
  schedule();
  const timer = setInterval(schedule, SCHEDULE_INTERVAL_MS);

  const highlight = highlighter(handlers.onActive, () => {
    const now = (context.currentTime - start) * 1000 * speed;
    if (now > end) {
      stop();
      handlers.onEnd();
      return null;
    }
    return chosen
      .filter((note) => note.time <= now && now < note.time + note.duration)
      .map((note) => note.id);
  });

  function stop() {
    clearInterval(timer);
    highlight.stop();
    close();
  }
  return { stop };
}

/**
 * Plays the notes on the beats of the metronome, from the beat that has
 * `from` (in quarter notes). It waits for that beat of the bar; `onStart`
 * runs when the first beat is planned.
 */
function playWithMetronome(
  notes: ScoreNote[],
  bars: number[],
  from: number,
  { engine, quarterNotesPerBeat }: MetronomeSync,
  handlers: { onStart: () => void; onActive: (ids: string[]) => void; onEnd: () => void },
): Session {
  const chosen = notes
    .filter((note) => note.beat >= from - EPSILON)
    .toSorted((a, b) => a.beat - b.beat);
  if (chosen.length === 0) {
    setTimeout(handlers.onEnd);
    return { stop: () => {} };
  }
  const context = getAudioContext();
  const { output, close } = openOutput(context);
  // The notes that are planned, with their times on the clock of `performance.now()`.
  let planned: { id: string; start: number; end: number }[] = [];
  // The place in the score that the next beat plays. Null until the first beat.
  let position: number | null = null;
  let next = 0;
  let endTimer: ReturnType<typeof setTimeout> | undefined;

  const removeListener = engine.onTick((tick) => {
    if (tick.sub !== 0) return;
    if (position === null) {
      const first = startBeat(bars, from, tick.beatsPerBar, quarterNotesPerBeat);
      // This tick is the beat before the first one.
      if ((tick.beat + 1) % tick.beatsPerBar !== first.barBeat) return;
      position = first.beat;
      handlers.onStart();
    }

    // The next beat, at the tempo of this one.
    const beatMs = 60000 / tick.bpm;
    const msPerQuarterNote = beatMs / quarterNotesPerBeat;
    const beatStart = tick.time + beatMs;
    while (next < chosen.length && chosen[next]!.beat < position + quarterNotesPerBeat - EPSILON) {
      const note = chosen[next++];
      const start = beatStart + (note!.beat - position) * msPerQuarterNote;
      const end = start + note!.beats * msPerQuarterNote;
      tone(
        context,
        output,
        note!.pitch,
        contextTimeAt(context, start),
        contextTimeAt(context, end),
      );
      planned.push({ id: note!.id, start, end });
    }
    position += quarterNotesPerBeat;

    if (next >= chosen.length && endTimer === undefined) {
      const last = Math.max(...planned.map((note) => note.end));
      endTimer = setTimeout(() => {
        stop();
        handlers.onEnd();
      }, last - performance.now());
    }
  });

  const highlight = highlighter(handlers.onActive, () => {
    const now = performance.now();
    planned = planned.filter((note) => note.end > now);
    return planned.filter((note) => note.start <= now).map((note) => note.id);
  });

  function stop() {
    removeListener();
    clearTimeout(endTimer);
    highlight.stop();
    close();
  }
  return { stop };
}

/**
 * Calls `onActive` on each frame when the notes from `sounding` change.
 * `sounding` returns null at the end.
 */
function highlighter(onActive: (ids: string[]) => void, sounding: () => string[] | null) {
  let shown = "";
  let frame = requestAnimationFrame(function update() {
    const ids = sounding();
    if (ids === null) return;
    const key = ids.join(" ");
    if (key !== shown) {
      shown = key;
      onActive(ids);
    }
    frame = requestAnimationFrame(update);
  });
  return { stop: () => cancelAnimationFrame(frame) };
}

/** A soft triangle tone of the MIDI note `pitch`, from `from` to `to`, in seconds of the audio clock. */
function tone(context: AudioContext, output: AudioNode, pitch: number, from: number, to: number) {
  // A time in the past: at once.
  const start = Math.max(from, context.currentTime);
  const oscillator = context.createOscillator();
  oscillator.type = "triangle";
  oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
  const gain = context.createGain();
  const release = Math.max(start + ATTACK_S, to - RELEASE_S);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(VOLUME, start + ATTACK_S);
  gain.gain.setValueAtTime(VOLUME, release);
  gain.gain.linearRampToValueAtTime(0, release + RELEASE_S);
  oscillator.connect(gain).connect(output);
  oscillator.start(start);
  oscillator.stop(release + RELEASE_S + 0.01);
}

/** The voices of the notes, in order: by staff, then by voice. */
export function scoreVoices(notes: PlayableNote[]): string[] {
  return [...new Set(notes.map((note) => note.voice))].toSorted((a, b) => {
    const [staffA, voiceA] = a.split(".").map(Number);
    const [staffB, voiceB] = b.split(".").map(Number);
    return staffA! - staffB! || voiceA! - voiceB!;
  });
}
