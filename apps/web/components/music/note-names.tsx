"use client";

import { useSyncExternalStore } from "react";

import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import {
  defaultNoteNames,
  fromEnglish,
  isNotation,
  type Notation,
} from "@/lib/music/chords/notation";

// The note names that the user reads: English (B, Bb) or German (H, B), as in
// Hungary. The choice belongs to the device, like the settings of the sheet,
// so it lives in `localStorage`. Without a choice, it follows the language:
// German note names for Hungarian.

const STORAGE_KEY = "note-names";
const listeners = new Set<() => void>();
// The choice when storage cannot keep it, e.g. in some private windows.
let unsaved: Notation | null = null;

function getSnapshot(): Notation | null {
  if (unsaved !== null) return unsaved;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isNotation(value) ? value : null;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The note names to show. The server and the first render use the default of the language. */
export function useNoteNames(): Notation {
  const { locale } = useI18n();
  return useSyncExternalStore(subscribe, getSnapshot, () => null) ?? defaultNoteNames(locale);
}

export function setNoteNames(notation: Notation) {
  try {
    localStorage.setItem(STORAGE_KEY, notation);
    unsaved = null;
  } catch {
    unsaved = notation;
  }
  listeners.forEach((listener) => listener());
}

/** A key or a chord in English note names (e.g. from the models), shown in the user's note names. */
export function KeyName({ value }: { value: string }) {
  return fromEnglish(value, useNoteNames());
}

/** Chooses the note names. */
export function NoteNamesSelect({
  id,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const { m } = useI18n();
  const notation = useNoteNames();
  return (
    <NativeSelect
      id={id}
      aria-label={ariaLabel}
      value={notation}
      onChange={(event) => {
        if (isNotation(event.target.value)) setNoteNames(event.target.value);
      }}
      className={className}
    >
      <option value="english">{m.components.noteNames.english}</option>
      <option value="german">{m.components.noteNames.german}</option>
    </NativeSelect>
  );
}
