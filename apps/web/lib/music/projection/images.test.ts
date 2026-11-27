import { describe, expect, it } from "vitest";

import {
  clampOffset,
  clampScale,
  DEFAULT_IMAGE_ADJUST,
  imageAdjustSchema,
  imageBox,
  turnImage,
  type ImageAdjust,
} from "./images";

const adjust = (changes: Partial<ImageAdjust> = {}): ImageAdjust => ({
  ...DEFAULT_IMAGE_ADJUST,
  ...changes,
});

describe("imageBox", () => {
  it("fits a wide image to the width of a narrower screen", () => {
    // 2:1 on 16:9: full width, 16/9 / 2 of the height.
    expect(imageBox(adjust(), 2000, 1000, 16 / 9)).toEqual({
      centerX: 0.5,
      centerY: 0.5,
      width: 1,
      height: 8 / 9,
      rotation: 0,
    });
  });

  it("fits a tall image to the height", () => {
    const box = imageBox(adjust(), 1000, 2000, 16 / 9);
    expect(box.height).toBe(1);
    expect(box.width).toBeCloseTo(0.5 / (16 / 9));
  });

  it("fills the screen with cover, and cuts off the rest", () => {
    const box = imageBox(adjust({ fit: "cover" }), 2000, 1000, 16 / 9);
    expect(box.height).toBe(1);
    expect(box.width).toBeCloseTo(2 / (16 / 9));
  });

  it("scales and moves the image", () => {
    const box = imageBox(adjust({ scale: 50, x: -25, y: 10 }), 1600, 900, 16 / 9);
    expect(box).toEqual({ centerX: 0.25, centerY: 0.6, width: 0.5, height: 0.5, rotation: 0 });
  });

  it("fits a turned image by its turned shape", () => {
    // A wide photo, turned upright on a wide screen: as high as the screen.
    // Before the rotation, the image is as wide as the screen is high, and half as high.
    const box = imageBox(adjust({ rotation: 90 }), 2000, 1000, 16 / 9);
    expect(box.width * (16 / 9)).toBeCloseTo(1);
    expect(box.height).toBeCloseTo(0.5);
  });

  it("keeps the shape of the image for all fits, rotations and screens", () => {
    for (const fit of ["contain", "cover"] as const) {
      for (const rotation of [0, 90, 180, 270] as const) {
        for (const ratio of [4 / 3, 16 / 9, 0.5]) {
          const box = imageBox(adjust({ fit, rotation }), 1200, 800, ratio);
          expect((box.width * ratio) / box.height).toBeCloseTo(1.5);
        }
      }
    }
  });
});

describe("imageAdjustSchema", () => {
  it("accepts the default and refuses values outside the limits", () => {
    expect(imageAdjustSchema.parse(DEFAULT_IMAGE_ADJUST)).toEqual(DEFAULT_IMAGE_ADJUST);
    expect(imageAdjustSchema.safeParse(adjust({ background: "blur" })).success).toBe(true);
    expect(imageAdjustSchema.safeParse({ ...adjust(), background: "image" }).success).toBe(false);
    expect(imageAdjustSchema.safeParse(adjust({ scale: 5 })).success).toBe(false);
    expect(imageAdjustSchema.safeParse(adjust({ x: 51 })).success).toBe(false);
    expect(imageAdjustSchema.safeParse({ ...adjust(), rotation: 45 }).success).toBe(false);
    expect(imageAdjustSchema.safeParse(adjust({ backgroundColor: "red" })).success).toBe(false);
  });
});

describe("helpers", () => {
  it("keeps the values within the limits", () => {
    expect(clampOffset(70.4)).toBe(50);
    expect(clampOffset(-12.6)).toBe(-13);
    expect(clampScale(1)).toBe(10);
    expect(clampScale(999)).toBe(400);
  });

  it("turns a quarter at a time", () => {
    expect(turnImage(0, 1)).toBe(90);
    expect(turnImage(270, 1)).toBe(0);
    expect(turnImage(0, -1)).toBe(270);
  });
});
