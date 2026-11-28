import { describe, expect, it } from "vitest";

import {
  blockAfterMove,
  blockCountdown,
  blockPlan,
  blockRuns,
  formatCountdown,
  movedIndex,
  normalizeBlocks,
  runSheetWithBlocks,
  untilInstant,
  withBlockAfterMove,
  withBlocksAfterReorder,
  type EventBlock,
} from "./event-blocks";

const rows = (...blocks: (string | null)[]) =>
  blocks.map((blockKey, index) => ({ key: `item-${index}`, blockKey }));
const blocksOf = (list: { blockKey?: string | null }[]) => list.map((row) => row.blockKey ?? null);

describe("blockRuns", () => {
  it("finds the adjacent items of each block, in order", () => {
    expect(blockRuns(rows(null, "a", "a", "b", null, "a"))).toEqual([
      { blockKey: "a", first: 1, last: 2 },
      { blockKey: "b", first: 3, last: 3 },
      { blockKey: "a", first: 5, last: 5 },
    ]);
    expect(blockRuns([{}, { blockKey: null }])).toEqual([]);
  });
});

describe("normalizeBlocks", () => {
  it("keeps the longest run of a block, and the first one of the same length", () => {
    expect(blocksOf(normalizeBlocks(rows("a", null, "a", "a")))).toEqual([null, null, "a", "a"]);
    expect(blocksOf(normalizeBlocks(rows("a", "b", "a")))).toEqual(["a", "b", null]);
  });

  it("gives the same array when the blocks are in order", () => {
    const list = rows(null, "a", "a", "b");
    expect(normalizeBlocks(list)).toBe(list);
  });
});

describe("blockAfterMove", () => {
  it("puts an item between two items of a block in the block", () => {
    expect(blockAfterMove(rows("a", null, "a"), 1)).toBe("a");
    expect(blockAfterMove(rows("a", "b", "a"), 1)).toBe("a");
  });

  it("keeps an item next to its own block in it, and an item from outside out", () => {
    expect(blockAfterMove(rows("a", "a", "a", null), 2)).toBe("a");
    expect(blockAfterMove(rows("a", "a", null, "x"), 2)).toBeNull();
  });

  it("takes the block from an item far from its block, but not from the only item of a block", () => {
    expect(blockAfterMove(rows("a", "a", null, "a"), 3)).toBeNull();
    expect(blockAfterMove(rows(null, "b", "b", "a"), 3)).toBe("a");
  });

  it("changes only the moved row", () => {
    const list = rows("a", null, "a");
    const next = withBlockAfterMove(list, 1);
    expect(blocksOf(next)).toEqual(["a", "a", "a"]);
    expect(next[0]).toBe(list[0]);
    expect(withBlockAfterMove(next, 1)).toBe(next);
  });
});

describe("blockPlan", () => {
  it("adds the planned times of the items of the block, and counts the items without a time", () => {
    const items = [
      { blockKey: "a", seconds: 300 },
      { blockKey: "a", seconds: null },
      { blockKey: null, seconds: 600 },
      { blockKey: "a", seconds: 120 },
    ];
    expect(blockPlan(items, "a")).toEqual({ seconds: 420, unknown: 1, count: 3 });
    expect(blockPlan(items, "b")).toEqual({ seconds: 0, unknown: 0, count: 0 });
  });
});

describe("runSheetWithBlocks", () => {
  const block = {
    key: "a",
    name: "Worship",
    countdown: "off" as const,
    until: null,
    startedAt: null,
  };
  const startsAt = "2026-11-15T09:00:00.000Z";
  const at = (minutes: number) => Date.parse(startsAt) + minutes * 60_000;

  it("gives a block with a time of its own that time, and counts its items without a time as known", () => {
    const items = [
      { seconds: 300, blockKey: null },
      { seconds: null, blockKey: "a" },
      { seconds: 240, blockKey: "a" },
      { seconds: 60, blockKey: null },
    ];
    expect(runSheetWithBlocks(startsAt, items, [{ ...block, durationSeconds: 1200 }])).toEqual({
      starts: [at(0), at(5), at(5), at(25)],
      totalSeconds: 1560,
      unknown: 0,
    });
  });

  it("is the run sheet of the items for a block without a time", () => {
    const items = [
      { seconds: 300, blockKey: "a" },
      { seconds: null, blockKey: "a" },
    ];
    expect(runSheetWithBlocks(startsAt, items, [block])).toEqual({
      starts: [at(0), at(5)],
      totalSeconds: 300,
      unknown: 1,
    });
  });
});

describe("movedIndex", () => {
  it("finds the one item that moved up or down", () => {
    expect(movedIndex(["a", "b", "c", "d"], ["a", "d", "b", "c"])).toBe(1);
    expect(movedIndex(["a", "b", "c", "d"], ["b", "c", "a", "d"])).toBe(2);
    expect(movedIndex(["a", "b"], ["b", "a"])).toBe(0);
  });

  it("gives null for the same order, or more than one move", () => {
    expect(movedIndex(["a", "b"], ["a", "b"])).toBeNull();
    expect(movedIndex(["a", "b", "c", "d"], ["b", "a", "d", "c"])).toBeNull();
    expect(movedIndex(["a", "b"], ["a"])).toBeNull();
  });
});

describe("withBlocksAfterReorder", () => {
  it("puts an item that moves into a block in it, and keeps the other items of the block", () => {
    const before = rows("a", "a", "a", null);
    const after = [before[0]!, before[3]!, before[1]!, before[2]!];
    expect(blocksOf(withBlocksAfterReorder(before, after))).toEqual(["a", "a", "a", "a"]);
  });

  it("takes the block from an item that moves away from it", () => {
    const before = rows("a", "a", null, null);
    const after = [before[1]!, before[2]!, before[3]!, before[0]!];
    expect(blocksOf(withBlocksAfterReorder(before, after))).toEqual(["a", null, null, null]);
  });
});

describe("blockCountdown", () => {
  const block = (patch: Partial<EventBlock>): EventBlock => ({
    key: "a",
    name: "Worship",
    countdown: "remaining",
    until: null,
    startedAt: null,
    ...patch,
  });
  const startsAt = "2026-11-15T09:00:00.000Z";
  const now = Date.parse("2026-11-15T09:10:00.000Z");

  it("gives the planned time before the start, and the time left after it", () => {
    expect(blockCountdown(block({}), 900, startsAt, now)).toEqual({
      kind: "notStarted",
      seconds: 900,
    });
    expect(
      blockCountdown(block({ startedAt: "2026-11-15T09:05:00.000Z" }), 900, startsAt, now),
    ).toEqual({
      kind: "running",
      seconds: 600,
    });
    // Over time.
    expect(
      blockCountdown(block({ startedAt: "2026-11-15T08:50:00.000Z" }), 900, startsAt, now),
    ).toEqual({
      kind: "running",
      seconds: -300,
    });
  });

  it("does not count a run that ended more than 30 minutes ago", () => {
    expect(
      blockCountdown(block({ startedAt: "2026-11-14T09:00:00.000Z" }), 900, startsAt, now),
    ).toEqual({
      kind: "notStarted",
      seconds: 900,
    });
  });

  it("counts to the clock time on the day of the event, in the time zone of the church", () => {
    // 10:00 in Budapest in winter is 09:00 UTC.
    expect(blockCountdown(block({ countdown: "until", until: "10:30" }), 0, startsAt, now)).toEqual(
      {
        kind: "until",
        seconds: 20 * 60,
      },
    );
    // In summer, 10:00 in Budapest is 08:00 UTC.
    expect(untilInstant("10:00", "2026-07-05T08:00:00.000Z")).toBe(
      Date.parse("2026-07-05T08:00:00.000Z"),
    );
    // An event that starts after midnight UTC on the day before in Budapest.
    expect(untilInstant("00:30", "2026-11-14T23:10:00.000Z")).toBe(
      Date.parse("2026-11-14T23:30:00.000Z"),
    );
    expect(untilInstant("bad", startsAt)).toBeNull();
  });

  it("counts down the time of the block itself", () => {
    expect(
      blockCountdown(
        block({ durationSeconds: 1200, startedAt: "2026-11-15T09:05:00.000Z" }),
        900,
        startsAt,
        now,
      ),
    ).toEqual({
      kind: "running",
      seconds: 900,
    });
  });

  it("gives nothing without a countdown", () => {
    expect(blockCountdown(block({ countdown: "off" }), 900, startsAt, now)).toBeNull();
  });

  it("gives nothing without a planned time, not a time over at once", () => {
    expect(
      blockCountdown(block({ startedAt: "2026-11-15T09:09:59.000Z" }), 0, startsAt, now),
    ).toBeNull();
    expect(blockCountdown(block({}), 0, startsAt, now)).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("shows minutes and seconds, hours when needed, and the time over", () => {
    expect(formatCountdown(760)).toEqual({ text: "12:40", over: false });
    expect(formatCountdown(0.2)).toEqual({ text: "0:01", over: false });
    expect(formatCountdown(0)).toEqual({ text: "0:00", over: false });
    expect(formatCountdown(3725)).toEqual({ text: "1:02:05", over: false });
    expect(formatCountdown(-80.5)).toEqual({ text: "1:20", over: true });
  });
});
