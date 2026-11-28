import { describe, expect, it } from "vitest";

import {
  addMarkEdits,
  distanceToStroke,
  lineAnchor,
  mergeFreshMarks,
  sheetMarkSchema,
  simplifyStroke,
  strokeBounds,
  strokePath,
  type SheetMark,
} from "./sheet-marks";

const ID = "6f1c2a0e-3b7d-4c55-9a1e-2f4b8c9d0e1f";

describe("sheetMarkSchema", () => {
  it("accepts a pen stroke and a text", () => {
    const stroke = {
      id: ID,
      kind: "pen",
      anchor: lineAnchor(2, 0, 1),
      color: "red",
      width: 0.07,
      points: [0, 0, 1, 1],
    };
    expect(sheetMarkSchema.parse(stroke)).toEqual(stroke);
    const text = {
      id: ID,
      kind: "text",
      anchor: "h",
      color: "blue",
      x: 1,
      y: -0.5,
      size: 0.9,
      text: " x2 ",
    };
    expect(sheetMarkSchema.parse(text)).toEqual({ ...text, text: "x2" });
  });

  it("refuses an odd number of coordinates, a wrong anchor and an empty text", () => {
    const stroke = { id: ID, kind: "pen", anchor: "0.0.0", color: "red", width: 0.07 };
    expect(sheetMarkSchema.safeParse({ ...stroke, points: [0, 0, 1] }).success).toBe(false);
    expect(sheetMarkSchema.safeParse({ ...stroke, anchor: "chorus", points: [0, 0] }).success).toBe(
      false,
    );
    const text = { id: ID, kind: "text", anchor: "h", color: "blue", x: 1, y: 1, size: 0.9 };
    expect(sheetMarkSchema.safeParse({ ...text, text: "  " }).success).toBe(false);
  });

  it("refuses fields that a mark does not have", () => {
    const stroke = {
      id: ID,
      kind: "pen",
      anchor: "h",
      color: "red",
      width: 0.07,
      points: [0, 0],
      text: "x",
    };
    expect(sheetMarkSchema.safeParse(stroke).success).toBe(false);
  });
});

describe("simplifyStroke", () => {
  it("removes the points on a straight line", () => {
    expect(simplifyStroke([0, 0, 1, 0.001, 2, 0, 3, 0], 0.01)).toEqual([0, 0, 3, 0]);
  });

  it("keeps the corners", () => {
    expect(simplifyStroke([0, 0, 1, 0, 2, 0, 2, 1, 2, 2], 0.01)).toEqual([0, 0, 2, 0, 2, 2]);
  });

  it("keeps short strokes as they are", () => {
    expect(simplifyStroke([0, 0], 0.01)).toEqual([0, 0]);
    expect(simplifyStroke([0, 0, 1, 1], 0.01)).toEqual([0, 0, 1, 1]);
  });
});

describe("strokePath", () => {
  it("draws a dot for one point and a line for two", () => {
    expect(strokePath([1, 2])).toBe("M1 2l0 0");
    expect(strokePath([1, 2, 3, 4])).toBe("M1 2L3 4");
  });

  it("draws curves through the middle points", () => {
    expect(strokePath([0, 0, 1, 1, 2, 0])).toBe("M0 0Q1 1 1.5 0.5L2 0");
  });
});

describe("distanceToStroke", () => {
  it("measures to the nearest segment", () => {
    expect(distanceToStroke(1, 1, [0, 0, 2, 0])).toBe(1);
    expect(distanceToStroke(3, 0, [0, 0, 2, 0])).toBe(1);
    expect(distanceToStroke(0, 2, [0, 0])).toBe(2);
  });
});

describe("strokeBounds", () => {
  it("gives the box around the points", () => {
    expect(strokeBounds([1, 5, -2, 3, 4, -1])).toEqual([-2, -1, 4, 5]);
  });
});

describe("mergeFreshMarks", () => {
  const mark = (id: string, text = id) => ({ id, text }) as unknown as SheetMark;

  it("takes the new marks of the arrangements without edits", () => {
    const fresh = { b: [mark("b-new")], added: [mark("c")] };
    expect(mergeFreshMarks(fresh, {})).toEqual(fresh);
  });

  it("applies the edits of the user to the new marks", () => {
    // The browser copy did not have A and B. The user added C and changed D before the fresh data came.
    const edits = addMarkEdits(addMarkEdits(undefined, { remove: [], add: [mark("c")] }), {
      remove: [mark("d")],
      add: [mark("d", "moved")],
    });
    const fresh = { a: [mark("a"), mark("b"), mark("d"), mark("e")], gone: [] };
    expect(mergeFreshMarks(fresh, { a: edits })).toEqual({
      a: [mark("a"), mark("b"), mark("d", "moved"), mark("e"), mark("c")],
      gone: [],
    });
  });

  it("keeps a mark out that the user removed, and does not add a saved mark twice", () => {
    const edits = addMarkEdits(addMarkEdits(undefined, { remove: [], add: [mark("c")] }), {
      remove: [mark("a")],
      add: [],
    });
    expect(mergeFreshMarks({ x: [mark("a"), mark("c")] }, { x: edits })).toEqual({
      x: [mark("c")],
    });
  });
});
