import { describe, expect, it } from "vitest";

import { SWIPE_MAX_MS, SWIPE_MIN_PX, swipeStep } from "./swipe";

describe("swipeStep", () => {
  it("turns forward on a swipe to the left and back on a swipe to the right", () => {
    expect(swipeStep(-80, 0, 200)).toBe(1);
    expect(swipeStep(80, 0, 200)).toBe(-1);
  });

  it("needs a minimum distance", () => {
    expect(swipeStep(-(SWIPE_MIN_PX - 1), 0, 200)).toBe(0);
    expect(swipeStep(-SWIPE_MIN_PX, 0, 200)).toBe(1);
  });

  it("ignores a slow move", () => {
    expect(swipeStep(-200, 0, SWIPE_MAX_MS)).toBe(1);
    expect(swipeStep(-200, 0, SWIPE_MAX_MS + 1)).toBe(0);
  });

  it("ignores a mostly vertical move", () => {
    expect(swipeStep(-80, 60, 200)).toBe(0);
    expect(swipeStep(-80, -60, 200)).toBe(0);
    expect(swipeStep(-90, 50, 200)).toBe(1);
  });
});
