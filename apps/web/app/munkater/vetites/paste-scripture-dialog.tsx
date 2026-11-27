"use client";

import type { ScriptureTranslation } from "@/lib/music/scripture/translations";

// Phase 6 (scripture): pasting the text of a "pasted" translation. Not available yet.
export function PasteScriptureDialog(_props: {
  reference: string;
  translation: ScriptureTranslation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (book: string, verses: { chapter: number; verse: number; text: string }[]) => void;
  eventId: string | null;
}) {
  return null;
}
