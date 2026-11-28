import { describe, expect, it } from "vitest";

import { isAbortError } from "./engine";
import { FakeOcrEngine } from "./fake-engine";
import { readChart, type ReadChartProgress } from "./read-chart";

function line(text: string, y: number) {
  const box = { x: 0, y, width: text.length * 10, height: 20 };
  return { words: [{ text, box }], box };
}

describe("readChart", () => {
  it("reads the images in order, with the progress of each page", async () => {
    const engine = new FakeOcrEngine([
      { width: 100, height: 100, lines: [line("First", 0)] },
      { width: 100, height: 100, lines: [line("Second", 0)] },
    ]);
    const progress: ReadChartProgress[] = [];

    const chart = await readChart(engine, [new Blob(["1"]), new Blob(["2"])], {
      onProgress: (p) => progress.push(p),
    });

    expect(chart).toBe("First\n\nSecond");
    expect(progress.map(({ page, count }) => [page, count])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("stops when the signal stops it", async () => {
    const engine = new FakeOcrEngine([{ width: 100, height: 100, lines: [line("First", 0)] }]);
    const controller = new AbortController();
    controller.abort();

    const error = await readChart(engine, [new Blob(["1"])], { signal: controller.signal }).catch(
      (e: unknown) => e,
    );
    expect(isAbortError(error)).toBe(true);
  });
});
