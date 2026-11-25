// The run sheet of an event: the planned time of each item, its planned start
// and the total time. The page of the event shows it, and the projection
// controller compares it with the clock. Keep the limit in sync with the check
// in the `event_item_durations` migration.

/** At most 24 hours, as the duration of an event. */
export const EVENT_ITEM_DURATION_MAX_SECONDS = 24 * 60 * 60;

/**
 * The planned time of an item in seconds: its own time, else the duration of
 * the arrangement of a song. Null: the item has no time.
 */
export function plannedSeconds(
  own: number | null | undefined,
  arrangementSeconds?: number | null,
): number | null {
  return own ?? arrangementSeconds ?? null;
}

/** The planned time of a saved item of an event (see `plannedSeconds`). */
export function itemPlannedSeconds(
  item: { durationSeconds: number | null } & (
    { kind: "song"; arrangement: { durationSeconds: number | null } } | { kind: "text" }
  ),
): number | null {
  return plannedSeconds(
    item.durationSeconds,
    item.kind === "song" ? item.arrangement.durationSeconds : null,
  );
}

export type RunSheet = {
  /** The planned start of each item, in milliseconds since the epoch. */
  starts: number[];
  /** The planned time of all items with a time. */
  totalSeconds: number;
  /** The number of items without a time: they count as 0. */
  unknown: number;
};

/** The run sheet of the items with their planned times (see `plannedSeconds`), from the start of the event. */
export function runSheet(startsAt: string, seconds: (number | null)[]): RunSheet {
  let offset = 0;
  let unknown = 0;
  const start = Date.parse(startsAt);
  const starts = seconds.map((value) => {
    const itemStart = start + offset * 1000;
    if (value === null) unknown += 1;
    else offset += value;
    return itemStart;
  });
  return { starts, totalSeconds: offset, unknown };
}

/**
 * The text of the time field of an item: whole minutes ("5") or minutes and
 * seconds ("4:05"). Empty: null (no time). Another text, 0 or more than the
 * limit: undefined. A number without a colon is minutes, not seconds as in
 * the duration field of an arrangement: most items take whole minutes, and
 * the hint of the field tells the format. The text of `formatMinutesSeconds`
 * reads back as the same time.
 */
export function parseItemDuration(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let seconds: number | undefined;
  if (/^\d{1,4}$/.test(trimmed)) seconds = Number(trimmed) * 60;
  else {
    const match = /^(\d{1,4}):([0-5]\d)$/.exec(trimmed);
    if (match) seconds = Number(match[1]) * 60 + Number(match[2]);
  }
  return seconds !== undefined && seconds >= 1 && seconds <= EVENT_ITEM_DURATION_MAX_SECONDS
    ? seconds
    : undefined;
}

/**
 * The live item against its planned time: "early" before its planned start,
 * "late" after its planned end, by whole minutes (rounded down), else "onTime".
 * Null when the item has no planned start, or no time.
 */
export function scheduleStatus(
  plan: { start: number; seconds: number | null } | undefined,
  now: number,
): { kind: "early" | "late"; minutes: number } | { kind: "onTime" } | null {
  if (!plan || plan.seconds === null) return null;
  const end = plan.start + plan.seconds * 1000;
  const minutes = (ms: number) => Math.floor(ms / 60_000);
  if (now < plan.start && minutes(plan.start - now) > 0)
    return { kind: "early", minutes: minutes(plan.start - now) };
  if (now > end && minutes(now - end) > 0) return { kind: "late", minutes: minutes(now - end) };
  return { kind: "onTime" };
}
