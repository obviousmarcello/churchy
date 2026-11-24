// Engraves the MusicXML scores of the sheet with Verovio, as SVG pages. It
// runs in a worker: the engraver is large, and a long score takes a moment, so
// the sheet stays smooth. See `score-view.tsx`.

import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";

export type ScoreRequest = {
  id: number;
  /** MusicXML text, as the server checked it. */
  data: string;
  /** Verovio options, e.g. `transpose`, `scale` and `pageWidth`. */
  options: Record<string, unknown>;
  /** False: without the chord names of the score, as the sheet's "Chords: hidden". */
  chords: boolean;
};

/** A note of the score, for the playback of rehearsal mode. */
export type ScoreNote = {
  /** The id of the note's element in the SVG. */
  id: string;
  /** The start, in ms from the start of the score, at the score's tempo. */
  time: number;
  /** In ms. */
  duration: number;
  /** The MIDI note number after the move to the new key, e.g. 60 for middle C. */
  pitch: number;
  /** The start, in quarter notes from the start of the score. The metronome plays the notes by it. */
  beat: number;
  /** In quarter notes. */
  beats: number;
};

/** When the notes of a score play: the notes by time, and the start of each bar in quarter notes. */
export type ScoreTimeline = { notes: ScoreNote[]; bars: number[] };

export type ScoreResponse =
  { id: number; pages: string[]; timeline: ScoreTimeline } | { id: number; error: string };

let toolkit: Promise<VerovioToolkit> | null = null;

self.onmessage = async (event: MessageEvent<ScoreRequest>) => {
  const { id, data, options, chords } = event.data;
  let response: ScoreResponse;
  try {
    response = await engrave(id, data, options, chords);
  } catch (error) {
    // Verovio throws on some files that it cannot read. The sheet must get an answer, or the score stays "loading".
    response = { id, error: `Verovio failed: ${String(error)}` };
  }
  self.postMessage(response);
};

async function engrave(
  id: number,
  data: ScoreRequest["data"],
  options: ScoreRequest["options"],
  chords: boolean,
): Promise<ScoreResponse> {
  let engraver: VerovioToolkit;
  try {
    toolkit ??= createVerovioModule().then((module) => new VerovioToolkit(module));
    engraver = await toolkit;
  } catch (error) {
    // The next request tries again.
    toolkit = null;
    return { id, error: `Verovio did not start: ${String(error)}` };
  }

  // Verovio moves the notes to another key when it reads the score, so each request reads it again.
  // Only MusicXML: Verovio does not guess the format, so a file cannot pass as MEI, which can hold any SVG.
  engraver.resetOptions();
  engraver.setOptions({ ...options, ...(chords ? {} : { transpose: "" }), inputFrom: "musicxml" });
  if (!engraver.loadData(data)) return { id, error: "Verovio cannot read the score" };
  if (!chords) {
    // Without the chord names (`<harm>` in MEI, Verovio's own format), read again, now with the move to the new key.
    // This MEI comes from Verovio, not from the file. An empty `<harm/>` has no end tag.
    const withoutChords = engraver.getMEI().replace(HARM, "");
    engraver.setOptions({ ...options, inputFrom: "mei" });
    if (!engraver.loadData(withoutChords))
      return { id, error: "Verovio cannot read the score without chords" };
  }
  const pages = Array.from({ length: engraver.getPageCount() }, (_, page) =>
    engraver.renderToSVG(page + 1),
  );
  // Each page has the music font of the text, e.g. the flats of the chord names. A style in the page works
  // for the whole document, so the first page is enough.
  return {
    id,
    pages: pages.map((svg, index) => (index === 0 ? svg : svg.replace(FONT_FACE, ""))),
    timeline: scoreTimeline(engraver),
  };
}

/** The notes of the loaded score, by time, and its bars. A note that does not sound (e.g. the end of a tie) is left out. */
function scoreTimeline(engraver: VerovioToolkit): ScoreTimeline {
  const entries = engraver.renderToTimemap({ includeMeasures: true });
  const ends = new Map(
    entries.flatMap((entry) => (entry.off ?? []).map((id) => [id, entry.qstamp] as const)),
  );
  const notes: ScoreNote[] = [];
  let tempo = DEFAULT_TEMPO;
  for (const entry of entries) {
    tempo = entry.tempo ?? tempo;
    for (const id of entry.on ?? []) {
      const midi = engraver.getMIDIValuesForElement(id);
      // A tied note ends with the last note of the tie: its length comes from its time.
      const end = ends.get(id);
      const beats =
        end !== undefined && end > entry.qstamp
          ? end - entry.qstamp
          : (midi.duration * tempo) / 60000;
      if (midi.duration > 0 && midi.pitch > 0)
        notes.push({ id, ...midi, beat: entry.qstamp, beats });
    }
  }
  notes.sort((a, b) => a.time - b.time);
  const bars = entries.filter((entry) => entry.measureOn).map((entry) => entry.qstamp);
  return { notes, bars };
}

/** Quarter notes per minute, when the score does not say. Verovio uses it too. */
const DEFAULT_TEMPO = 120;

const FONT_FACE = /@font-face\s*\{[^}]*\}/g;

/** A chord name in MEI: an empty `<harm …/>`, or a `<harm …>` with its content and end tag. */
const HARM = /<harm\b[^>]*\/>|<harm\b[^>]*>[\s\S]*?<\/harm>/g;
