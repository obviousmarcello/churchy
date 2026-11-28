import { describe, expect, it } from "vitest";

import {
  isEmptyView,
  ownValues,
  pinchSize,
  sheetViewSchema,
  storedSheetViewSchema,
} from "./sheet-view";

describe("sheetViewSchema", () => {
  it("takes some of the settings", () => {
    expect(sheetViewSchema.parse({ size: 150, pagesOnScreen: "auto" })).toEqual({
      size: 150,
      pagesOnScreen: "auto",
    });
  });

  it("refuses other settings and values out of range", () => {
    expect(sheetViewSchema.safeParse({ background: "white" }).success).toBe(false);
    expect(sheetViewSchema.safeParse({ size: 1000 }).success).toBe(false);
    expect(sheetViewSchema.safeParse({ size: 61 }).success).toBe(false);
    expect(sheetViewSchema.safeParse({ pagesOnScreen: 9 }).success).toBe(false);
  });
});

describe("storedSheetViewSchema", () => {
  it("drops the values that are not valid anymore and the unknown keys", () => {
    const view = storedSheetViewSchema.parse({ size: 1000, repeats: "label", other: true });
    expect(ownValues(view)).toEqual({ repeats: "label" });
    expect(ownValues(storedSheetViewSchema.parse({ size: 61 }))).toEqual({});
  });
});

describe("pinchSize", () => {
  it("takes the nearest size by ratio", () => {
    expect(pinchSize(100, 1)).toBe(100);
    expect(pinchSize(100, 1.02)).toBe(100);
    expect(pinchSize(100, 1.04)).toBe(105);
    expect(pinchSize(100, 1.12)).toBe(110);
    expect(pinchSize(100, 2)).toBe(200);
    expect(pinchSize(100, 0.66)).toBe(65);
  });

  it("stays between the smallest and the largest size", () => {
    expect(pinchSize(100, 10)).toBe(300);
    expect(pinchSize(100, 0.1)).toBe(60);
  });
});

describe("isEmptyView", () => {
  it("is true when every setting comes from the device", () => {
    expect(isEmptyView({})).toBe(true);
    expect(isEmptyView({ size: undefined })).toBe(true);
    expect(isEmptyView({ showChords: false })).toBe(false);
  });
});
