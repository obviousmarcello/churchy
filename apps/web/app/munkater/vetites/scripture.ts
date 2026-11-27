"use client";

import type { ProjectionPassage, ProjectionSource } from "@/lib/music/projection/slides";
import type { ScriptureTranslation } from "@/lib/music/scripture/translations";

// The text of the scripture readings of a projection. Scripture (Bible texts, translations, the
// shared cache of pasted texts) is phase 6 of the music merge: until it is merged, a reading
// shows its reference only (the item has no passage), and these hooks load nothing. The shapes
// are those of Music Sheet DB's `project/scripture.ts`, so the controller stays as copied.

export type ScriptureStatus =
  | { status: "unrecognized" }
  | { status: "off" }
  | { status: "loading" }
  | { status: "failed" }
  | { status: "notInstalled" }
  | { status: "unavailable" }
  | { status: "needsText" }
  | { status: "ready"; missing: boolean; truncated: boolean };

export type ScriptureReading = { translation: ScriptureTranslation; status: ScriptureStatus };

export type MoreVerses =
  { status: "ready"; label: string } | { status: "loading" } | { status: "failed" };

const NONE = {
  passages: new Map<string, ProjectionPassage>() as ReadonlyMap<string, ProjectionPassage>,
  readings: new Map<string, ScriptureReading>() as ReadonlyMap<string, ScriptureReading>,
  more: new Map<string, MoreVerses>() as ReadonlyMap<string, MoreVerses>,
  retry() {},
  loadMore(_key: string) {},
  addPasted(_translation: string, _book: string, _verses: unknown[]) {},
};

export function useScripturePassages(
  _sources: ProjectionSource[],
  _translations: ReadonlyMap<string, string>,
) {
  return NONE;
}
