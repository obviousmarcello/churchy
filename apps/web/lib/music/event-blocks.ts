// The blocks of the items of an event: a name for some adjacent items, e.g.
// "Worship" (three songs), with an optional countdown (see the migration
// `event_blocks`). The page of the event, the projection controller and the
// chord sheet use these rules. Keep `normalizeBlocks` in sync with
// `normalize_event_blocks()` and `BLOCK_RUN_STALE_MS` with
// `start_event_block()`.

import { churchDay, churchTime } from "./church-time";

/** Keep in sync with the check `event_blocks_name_check`. */
export const EVENT_BLOCK_NAME_MAX_LENGTH = 80;

/**
 * "off": no countdown. "remaining": the planned times of the items of the
 * block, from its start. "until": a clock time on the day of the event.
 */
export const BLOCK_COUNTDOWNS = ["off", "remaining", "until"] as const;

export type BlockCountdownMode = (typeof BLOCK_COUNTDOWNS)[number];

/** A run of a block ends this long after its planned end: the next start of the block starts again. */
export const BLOCK_RUN_STALE_MS = 30 * 60 * 1000;

export type EventBlock = {
  key: string;
  name: string;
  countdown: BlockCountdownMode;
  /** The clock time of the countdown "until", e.g. "10:00". Null for another countdown. */
  until: string | null;
  /** The start of the countdown "remaining". Null: not started (or another countdown). */
  startedAt: string | null;
  /**
   * The planned time of the whole block in seconds, e.g. 20 minutes for the
   * worship. Null: the planned times of its items. Left out in a copy of the
   * page from an older version.
   */
  durationSeconds?: number | null;
};

/** An item of an event, with its block. Null or left out: no block. */
type BlockRow = { blockKey?: string | null };

/** Adjacent items of one block: the index of the first and of the last one. */
export type BlockRun = { blockKey: string; first: number; last: number };

/** The runs of the blocks, in order. A block can have more than one run before `normalizeBlocks`. */
export function blockRuns(rows: readonly BlockRow[]): BlockRun[] {
  const runs: BlockRun[] = [];
  rows.forEach((row, index) => {
    const blockKey = row.blockKey ?? null;
    if (blockKey === null) return;
    const last = runs.at(-1);
    if (last && last.blockKey === blockKey && last.last === index - 1) last.last = index;
    else runs.push({ blockKey, first: index, last: index });
  });
  return runs;
}

/**
 * The items of each block adjacent: of two or more runs of a block, the
 * longest one keeps the block (the first one of the same length), the items
 * of the others get no block. The same array when nothing changes.
 */
export function normalizeBlocks<Row extends BlockRow>(rows: Row[]): Row[] {
  const kept = new Map<string, BlockRun>();
  for (const run of blockRuns(rows)) {
    const best = kept.get(run.blockKey);
    if (!best || run.last - run.first > best.last - best.first) kept.set(run.blockKey, run);
  }
  let changed = false;
  const next = rows.map((row, index) => {
    const blockKey = row.blockKey ?? null;
    if (blockKey === null) return row;
    const run = kept.get(blockKey);
    if (run && index >= run.first && index <= run.last) return row;
    changed = true;
    return { ...row, blockKey: null };
  });
  return changed ? next : rows;
}

/**
 * The block of the row at `index` after a move. Between two items of a
 * block: that block. Next to an item of its own block, or the only item of
 * its block: its own block. Else none. So an item that moves inside a block
 * stays in it, and an item that moves to the edge of a block from outside
 * stays out.
 */
export function blockAfterMove(rows: readonly BlockRow[], index: number): string | null {
  const own = rows[index]?.blockKey ?? null;
  const before = rows[index - 1]?.blockKey ?? null;
  const after = rows[index + 1]?.blockKey ?? null;
  if (before !== null && before === after) return before;
  if (own === null) return null;
  if (before === own || after === own) return own;
  const alone = rows.every((row, other) => other === index || (row.blockKey ?? null) !== own);
  return alone ? own : null;
}

/** The rows with the block of the moved row (see `blockAfterMove`). The same array when nothing changes. */
export function withBlockAfterMove<Row extends BlockRow>(rows: Row[], index: number): Row[] {
  const blockKey = blockAfterMove(rows, index);
  if ((rows[index]?.blockKey ?? null) === blockKey) return rows;
  return rows.map((row, other) => (other === index ? { ...row, blockKey } : row));
}

/**
 * The index in `after` of the one item that moved from its place in
 * `before`, e.g. by a drag. Null when the order is the same, or when more
 * than one item moved.
 */
export function movedIndex(before: readonly string[], after: readonly string[]): number | null {
  if (before.length !== after.length) return null;
  let first = 0;
  while (first < before.length && before[first] === after[first]) first++;
  if (first === before.length) return null;
  let last = before.length - 1;
  while (before[last] === after[last]) last--;
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((key, index) => key === b[index]);
  // Up: from `last` to `first`.
  if (
    after[first] === before[last] &&
    same(after.slice(first + 1, last + 1), before.slice(first, last))
  )
    return first;
  // Down: from `first` to `last`.
  if (
    after[last] === before[first] &&
    same(after.slice(first, last), before.slice(first + 1, last + 1))
  )
    return last;
  return null;
}

/**
 * The rows after a change of the order: the moved row gets its block by
 * `blockAfterMove`. Then each block keeps one run (see `normalizeBlocks`).
 */
export function withBlocksAfterReorder<Row extends BlockRow & { key: string }>(
  before: readonly Row[],
  after: Row[],
): Row[] {
  const index = movedIndex(
    before.map((row) => row.key),
    after.map((row) => row.key),
  );
  return normalizeBlocks(index === null ? after : withBlockAfterMove(after, index));
}

/** The planned time of the items of the block, the number of its items without a time, and of all its items. */
export function blockPlan(
  items: readonly { blockKey?: string | null; seconds: number | null }[],
  blockKey: string,
): { seconds: number; unknown: number; count: number } {
  let seconds = 0;
  let unknown = 0;
  let count = 0;
  for (const item of items) {
    if ((item.blockKey ?? null) !== blockKey) continue;
    count++;
    if (item.seconds === null) unknown++;
    else seconds += item.seconds;
  }
  return { seconds, unknown, count };
}

/**
 * The run sheet of the items with their planned times and their blocks (see
 * `runSheet`). A block with a time of its own takes that time: the items
 * after it start after it, and its items without a time do not count as
 * unknown. Its items start one after the other from its start.
 */
export function runSheetWithBlocks(
  startsAt: string,
  items: readonly { seconds: number | null; blockKey?: string | null }[],
  blocks: readonly EventBlock[],
): { starts: number[]; totalSeconds: number; unknown: number } {
  const durations = new Map(
    blocks.flatMap((block) => (block.durationSeconds ? [[block.key, block.durationSeconds]] : [])),
  );
  const runEnds = new Map(
    blockRuns(items).flatMap((run) => (durations.has(run.blockKey) ? [[run.first, run]] : [])),
  );
  const start = Date.parse(startsAt);
  const starts: number[] = [];
  let offset = 0;
  let unknown = 0;
  let block: { last: number; start: number; seconds: number } | null = null;
  items.forEach((item, index) => {
    const run = runEnds.get(index);
    if (run) block = { last: run.last, start: offset, seconds: durations.get(run.blockKey)! };
    starts.push(start + offset * 1000);
    if (item.seconds !== null) offset += item.seconds;
    else if (!block) unknown += 1;
    if (block && index === block.last) {
      offset = block.start + block.seconds;
      block = null;
    }
  });
  return { starts, totalSeconds: offset, unknown };
}

/** The blocks by key. */
export function blocksByKey(blocks: readonly EventBlock[]): Map<string, EventBlock> {
  return new Map(blocks.map((block) => [block.key, block]));
}

export type BlockCountdown =
  /** "remaining" before the start: the planned time of the block. */
  | { kind: "notStarted"; seconds: number }
  /** "remaining" after the start: the time left. Negative: over time. */
  | { kind: "running"; seconds: number }
  /** "until": the time to the clock time. Negative: over time. */
  | { kind: "until"; seconds: number };

/**
 * The countdown of a block at `now`, with the planned time of its items in
 * seconds (the time of the block itself wins). Null for no countdown, and
 * for "remaining" without a planned time: nothing to count down. A run that ended more than
 * `BLOCK_RUN_STALE_MS` ago, e.g. at a rehearsal the day before, counts as not
 * started. "until" counts to the clock time on the day of the start of the
 * event, in the time zone of the church.
 */
export function blockCountdown(
  block: EventBlock,
  plannedSeconds: number,
  eventStartsAt: string,
  now: number,
): BlockCountdown | null {
  if (block.countdown === "remaining") {
    plannedSeconds = block.durationSeconds ?? plannedSeconds;
    if (plannedSeconds <= 0) return null;
    const start = block.startedAt === null ? Number.NaN : Date.parse(block.startedAt);
    const end = start + plannedSeconds * 1000;
    if (Number.isNaN(start) || now > end + BLOCK_RUN_STALE_MS)
      return { kind: "notStarted", seconds: plannedSeconds };
    return { kind: "running", seconds: (end - now) / 1000 };
  }
  if (block.countdown === "until" && block.until !== null) {
    const target = untilInstant(block.until, eventStartsAt);
    return target === null ? null : { kind: "until", seconds: (target - now) / 1000 };
  }
  return null;
}

/** The instant of the clock time ("10:00") on the day of the event, in the time zone of the church. Null for a bad time. */
export function untilInstant(until: string, eventStartsAt: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(until);
  if (!match) return null;
  const [year, month, day] = churchDay(eventStartsAt).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return churchTime(year, month, day, Number(match[1]), Number(match[2])).getTime();
}

/**
 * The time of a countdown: "12:40", "1:02:05". Up to the next whole second
 * before the end, so "0:00" shows only at the end; down after it. `over`:
 * the time after the end.
 */
export function formatCountdown(seconds: number): { text: string; over: boolean } {
  const over = seconds < 0;
  const whole = over ? Math.floor(-seconds) : Math.ceil(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return {
    text: hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`,
    over,
  };
}
