"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

import { METRONOME_MAX_SUBDIVISION } from "@/lib/music/metronome/beat-clock";
import { MAX_LATENCY_MS } from "@/lib/music/metronome/latency-calibration";
import { HIGHLIGHTER_COLORS, PEN_COLORS } from "@/lib/music/sheet-marks";
import { sheetViewFields } from "@/lib/music/sheet-view";
import { SCORE_SPEEDS } from "./score-player";

// The settings of the chord sheet. They belong to the device (a tablet on a
// music stand needs other settings than a phone), so they live in
// `localStorage`, like the color theme. The user can also set the layout of
// each song for the type of the device (see `sheet-view.ts`); a song without
// its own values uses these.

export const SHEET_BASE_FONT_PX = 16;
/** With `pagesOnScreen: "auto"`, a page is at least this wide, in `em` of the sheet text. */
export const SHEET_MIN_PAGE_EM = 22;

/** The tools of mark mode. */
export const MARK_TOOLS = ["pen", "highlighter", "text", "eraser"] as const;
export type MarkTool = (typeof MARK_TOOLS)[number];

const sheetSettingsSchema = z.object({
  size: sheetViewFields.size.catch(100),
  /** It replaces `pages`, whose stored value was mostly the old default of 1. */
  pagesOnScreen: sheetViewFields.pagesOnScreen.catch("auto"),
  /** Where a song starts when the sheet has several: on a new screen, or on the next page. */
  songStart: z.enum(["screen", "page"]).catch("screen"),
  background: z.enum(["white", "tinted"]).catch("tinted"),
  showChords: sheetViewFields.showChords.catch(true),
  underlineSyllables: sheetViewFields.underlineSyllables.catch(false),
  /**
   * The score to show instead of the chords, by name (without case), e.g.
   * "Flute". A song without a score of this name shows the chords. Null: the chords.
   */
  scoreName: z.string().max(100).nullable().catch(null),
  /** The speed of the playback of a score in rehearsal mode, as a share of its tempo. */
  scoreSpeed: z.union(SCORE_SPEEDS.map((speed) => z.literal(speed))).catch(1),
  order: sheetViewFields.order.catch("arrangement"),
  repeats: sheetViewFields.repeats.catch("full"),
  keepAwake: z.boolean().catch(true),
  /**
   * The table of contents (for sheets with several songs) is a column next to
   * the sheet. If not, it opens over the sheet and closes when you choose a song.
   */
  dockContents: z.boolean().catch(false),
  /** The docked table of contents shows. */
  tableOfContents: z.boolean().catch(false),
  /** 0 to 1. */
  metronomeVolume: z.number().min(0).max(1).catch(0.8),
  /** The first beat of the bar has a higher click. */
  metronomeAccent: z.boolean().catch(true),
  /** Clicks per beat. */
  metronomeSubdivision: z.number().int().min(1).max(METRONOME_MAX_SUBDIVISION).catch(1),
  /** The whole header of the sheet pulses on each beat, so you can see the beat from a distance. */
  metronomePulseHeader: z.boolean().catch(true),
  /** The device vibrates on each beat, where the browser can (see `src/lib/metronome/haptics.ts`). */
  metronomeVibrate: z.boolean().catch(false),
  /** How the metronome counts 6/8, 9/8 and 12/8. The chart's tempo counts dotted beats (see `tempoScale()`). */
  compoundBeat: z.enum(["dotted", "eighth"]).catch("dotted"),
  /**
   * The delay of the speakers that the browser does not report, e.g. of
   * Bluetooth speakers, in ms. In a live session, the metronome plays earlier
   * by this time, so it sounds at the same time as on the other devices.
   */
  metronomeLatencyMs: z.number().int().min(0).max(MAX_LATENCY_MS).catch(0),
  /**
   * The MIDI device (through USB) that gets the metronome's clock, Start and
   * Stop. Null: none. The name shows while the device is not connected.
   */
  midiOutput: z.object({ id: z.string(), name: z.string() }).nullable().catch(null),
  /** Each click of the metronome also plays a note on MIDI channel 10. */
  midiClickNotes: z.boolean().catch(false),
  /**
   * This device sends the tempo to the delay effects of the mixing desk, with
   * the setup of the Mixer tab of the Configuration page (see `src/lib/mixer/settings.ts`). Also in the
   * projection controller.
   */
  mixerSync: z.boolean().catch(false),
  /** The MIDI output to the desk, for a desk that gets the tempo over MIDI. */
  mixerMidiOutput: z.object({ id: z.string(), name: z.string() }).nullable().catch(null),
  /** Rehearsal mode: a panel at the right side shows how to play the chords. */
  rehearsal: z.boolean().catch(false),
  rehearsalInstrument: z.enum(["guitar", "keys"]).catch("guitar"),
  guitarTuning: z.enum(["standard", "openD", "openG"]).catch("standard"),
  /** The first fret of the area of the neck for the guitar shapes. 0 is the open position. */
  guitarPosition: z.number().int().min(0).max(12).catch(0),
  /** The user's own marks on the sheet show. Mark mode always shows them. */
  showMarks: z.boolean().catch(true),
  markTool: z.enum(MARK_TOOLS).catch("pen"),
  penColor: z.enum(PEN_COLORS).catch("red"),
  penWidth: z.enum(["thin", "thick"]).catch("thin"),
  highlighterColor: z.enum(HIGHLIGHTER_COLORS).catch("yellow"),
  textColor: z.enum(PEN_COLORS).catch("blue"),
  textSize: z.enum(["small", "medium", "large"]).catch("medium"),
});

export type SheetSettings = z.output<typeof sheetSettingsSchema>;

export const DEFAULT_SHEET_SETTINGS: SheetSettings = sheetSettingsSchema.parse({});

const STORAGE_KEY = "sheet-settings";
const listeners = new Set<() => void>();

// The settings when storage cannot keep them: it is blocked (for example in
// some private windows) or full. They last until the next full page load.
let unsavedSettings: string | null = null;
let cached: { raw: string | null; settings: SheetSettings } | null = null;

function readRaw() {
  if (unsavedSettings !== null) return unsavedSettings;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): SheetSettings {
  try {
    return sheetSettingsSchema.parse(raw ? JSON.parse(raw) : {});
  } catch {
    return DEFAULT_SHEET_SETTINGS;
  }
}

// `useSyncExternalStore` needs the same object while the stored value stays the same.
function getSnapshot() {
  const raw = readRaw();
  if (cached?.raw !== raw) cached = { raw, settings: parse(raw) };
  return cached.settings;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Follows changes made in other tabs.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The server and the first render use the defaults; the stored settings follow after hydration. */
export function useSheetSettings(): SheetSettings {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_SHEET_SETTINGS);
}

export function updateSheetSettings(changes: Partial<SheetSettings>) {
  const raw = JSON.stringify({ ...getSnapshot(), ...changes });
  try {
    localStorage.setItem(STORAGE_KEY, raw);
    unsavedSettings = null;
  } catch {
    unsavedSettings = raw;
  }
  listeners.forEach((listener) => listener());
}
