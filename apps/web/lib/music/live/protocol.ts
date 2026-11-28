import { z } from "zod";

import {
  METRONOME_MAX_BEATS_PER_BAR,
  METRONOME_MAX_BPM,
  METRONOME_MIN_BPM,
} from "@/lib/music/metronome/beat-clock";
import type { BeatGrid } from "./beat-grid";

// The messages on the Realtime channel of a live session. Only the leader
// sends broadcasts (see the policies in the migration `live_sessions`). Each
// participant shows itself with Presence. The data comes from other browsers,
// so each device checks it before use.

/** A broadcast of the leader: the whole state, after each change and every few seconds. */
export const LIVE_STATE_EVENT = "state";
/** A broadcast of the leader: the session has ended. */
export const LIVE_END_EVENT = "end";

/** The leader sends the state again after this time, also without a change. In ms. */
export const LIVE_HEARTBEAT_MS = 5000;

/** The most songs with a leader's key: the most items of a setlist. */
const LIVE_MAX_KEYS = 100;

/**
 * A place in the sheet that is the same on all devices: a song (an item of
 * the event or an arrangement), and a section in it. The pages are different
 * on each device: they depend on the screen and the settings.
 */
export type LivePosition = {
  /** The `id` of the song of the sheet. */
  songId: string;
  /** The section, e.g. "verse 1#2" for the second "Verse 1" (see `sectionAnchors`). Null for the start of the song. */
  section: string | null;
  /**
   * The leader's sheet shows the sections as written, not in the section
   * order of the arrangement: the number in `section` does not count the
   * repeats of the arrangement. Missing in a state from an older browser.
   */
  written?: boolean;
};

export type LiveState = {
  /** Increases with each change. A device ignores a state with a lower number. */
  seq: number;
  /** The user who leads. A change of the leader comes with the state. */
  leaderId: string;
  grid: BeatGrid;
  /** Null before the leader shows a song. */
  position: LivePosition | null;
  /**
   * The leader's key for each song, by the `id` of the song of the sheet, in
   * English note names. All participants see the songs in these keys.
   */
  keys: Record<string, string>;
};

/** What each participant shows with Presence. */
export type LivePresence = {
  userId: string;
  /**
   * The display name. Empty for a user without one: the other devices show
   * a label in their own language, never the email.
   */
  name: string;
  following: boolean;
  /** The largest possible error of the shared clock on the device, in ms. Null before the first sync. */
  clockErrorMs: number | null;
};

const gridSchema = z.object({
  epoch: z.number().int().nonnegative(),
  running: z.boolean(),
  startTime: z.number().finite(),
  bpm: z.number().min(METRONOME_MIN_BPM).max(METRONOME_MAX_BPM),
  beatsPerBar: z.number().int().min(1).max(METRONOME_MAX_BEATS_PER_BAR),
});

const liveStateSchema = z.object({
  seq: z.number().int().nonnegative(),
  leaderId: z.uuid(),
  grid: gridSchema,
  position: z
    .object({
      songId: z.string().max(100),
      section: z.string().max(300).nullable(),
      written: z.boolean().optional(),
    })
    .nullable(),
  // A state from a browser before the keys has none.
  keys: z
    .record(z.string().max(100), z.string().regex(/^[A-G][#b]?m?$/))
    .refine((keys) => Object.keys(keys).length <= LIVE_MAX_KEYS)
    .default({}),
});

const livePresenceSchema = z.object({
  userId: z.uuid(),
  name: z.string().max(200),
  following: z.boolean(),
  clockErrorMs: z.number().finite().nonnegative().nullable(),
});

/** Null for a message that is not a valid state. */
export function parseLiveState(payload: unknown): LiveState | null {
  const result = liveStateSchema.safeParse(payload);
  return result.success ? result.data : null;
}

/** The valid presence entries, one per user. */
export function parseLivePresence(entries: unknown[]): LivePresence[] {
  const byUser = new Map<string, LivePresence>();
  for (const entry of entries) {
    const result = livePresenceSchema.safeParse(entry);
    if (result.success) byUser.set(result.data.userId, result.data);
  }
  return [...byUser.values()];
}

/** The newer of two states. */
export function newerState(current: LiveState | null, incoming: LiveState): LiveState {
  return current && current.seq >= incoming.seq ? current : incoming;
}

/** The value that a tab keeps for the latest state of the session `sessionId` (see `restoredLiveState`). */
export function storedLiveState(sessionId: string, state: LiveState): string {
  return JSON.stringify({ sessionId, state });
}

/**
 * The state that a tab kept (see `storedLiveState`), for its first state
 * after a reload: the leader goes on from it, with its place, keys and
 * metronome. Null when it is not valid, is for another session, or when
 * `leaderId` (the leader that the server knows) does not lead in it: then the
 * state comes from the channel.
 */
export function restoredLiveState(
  stored: string | null,
  sessionId: string,
  leaderId: string,
): LiveState | null {
  if (!stored) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(stored);
  } catch {
    return null;
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("sessionId" in payload) ||
    !("state" in payload)
  )
    return null;
  if (payload.sessionId !== sessionId) return null;
  const state = parseLiveState(payload.state);
  return state?.leaderId === leaderId ? state : null;
}

/**
 * A name for each section of a song, the same on all devices: its label and
 * the number of the time it comes, e.g. "chorus#2". Null for the parts
 * without a section. With another section order, the same name can mean
 * another place; the sheet then goes to the nearest one it has.
 */
export function sectionAnchors(sections: ({ label: string } | null)[]): (string | null)[] {
  const counts = new Map<string, number>();
  return sections.map((section) => {
    if (!section) return null;
    const label = section.label.trim().toLowerCase();
    const count = (counts.get(label) ?? 0) + 1;
    counts.set(label, count);
    return `${label}#${count}`;
  });
}
