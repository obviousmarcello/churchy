import type { ArrangementSummaryDTO } from "@/server/music/models/arrangements";
import { fromEnglish, type Notation } from "./chords/notation";

// `arrangementDetails()` of Music Sheet DB's `components/setlist-rows.tsx` (the rest of that file
// is the event run sheet, phase 4).

/** The key, the tempo and the length of an arrangement, for its row. */
export function arrangementDetails(
  arrangement: ArrangementSummaryDTO,
  notation: Notation,
  musicalKey?: string | null,
): string[] {
  const details: string[] = [];
  const key = musicalKey ?? arrangement.key;
  if (key) details.push(fromEnglish(key, notation));
  if (arrangement.bpm) details.push(`${arrangement.bpm} BPM`);
  if (arrangement.durationSeconds) {
    const seconds = arrangement.durationSeconds;
    details.push(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
  }
  return details;
}
