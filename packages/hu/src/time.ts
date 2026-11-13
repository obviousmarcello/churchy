import { budapestWallClock, parseIsoTime, toInstant } from "./date";
import type { CivilTime, TimeInput } from "./types";

const TIME_ONLY_RE = /^\d{2}:\d{2}(?::\d{2})?$/;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * Resolves a {@link TimeInput} to a wall-clock time.
 * `IsoTime` strings pass through (validated); instants are shown in Europe/Budapest.
 */
export function toCivilTime(input: TimeInput): CivilTime {
  if (typeof input === "string" && TIME_ONLY_RE.test(input)) return parseIsoTime(input);
  const w = budapestWallClock(toInstant(input));
  return { hour: w.hour, minute: w.minute };
}

/** Options for {@link formatTime}. */
export interface TimeOptions {
  /**
   * - `"clock"` (default): `18:00`
   * - `"spoken"`: `18 óra`, `18 óra 30 perc`
   */
  style?: "clock" | "spoken";
}

/**
 * Formats a time of day, 24-hour.
 *
 * @example formatTime("18:00") // "18:00"
 * @example formatTime("18:30", { style: "spoken" }) // "18 óra 30 perc"
 * @example formatTime("2026-03-29T01:00:00Z") // "03:00" (Budapest has just switched to CEST)
 */
export function formatTime(input: TimeInput, options: TimeOptions = {}): string {
  const t = toCivilTime(input);
  if (options.style === "spoken") {
    return t.minute === 0 ? `${t.hour} óra` : `${t.hour} óra ${t.minute} perc`;
  }
  return `${pad2(t.hour)}:${pad2(t.minute)}`;
}

/**
 * Formats a time span with an en dash.
 *
 * @example formatTimeRange("18:00", "19:30") // "18:00–19:30"
 */
export function formatTimeRange(
  start: TimeInput,
  end: TimeInput,
  options: TimeOptions = {},
): string {
  return `${formatTime(start, options)}–${formatTime(end, options)}`;
}
