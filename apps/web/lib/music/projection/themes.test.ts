import { describe, expect, it } from "vitest";

import { scriptureTextSpace, slideLayout, SLIDE_LAYOUT, SMALL_FONT } from "./slides";
import {
  FALLBACK_LOOK,
  resolveLook,
  resolveTheme,
  transitionMs,
  type ProjectionThemeDTO,
} from "./themes";

function theme(id: string, overrides: Partial<ProjectionThemeDTO> = {}): ProjectionThemeDTO {
  return {
    id,
    name: id,
    isDefault: false,
    look: { ...FALLBACK_LOOK, textColor: `#00000${id}` },
    ...overrides,
  };
}

const THEMES = [theme("1", { isDefault: true }), theme("2"), theme("3")];

describe("resolveTheme", () => {
  it("uses the theme of the item, else of the event, else the default", () => {
    expect(resolveTheme(THEMES, "3", "2")?.id).toBe("3");
    expect(resolveTheme(THEMES, null, "2")?.id).toBe("2");
    expect(resolveTheme(THEMES, undefined, null)?.id).toBe("1");
  });

  it("uses the theme of the arrangement between the item and the event", () => {
    expect(resolveTheme(THEMES, "3", "2", "1")?.id).toBe("3");
    expect(resolveTheme(THEMES, null, "2", "3")?.id).toBe("3");
    expect(resolveTheme(THEMES, null, null, "2")?.id).toBe("2");
    expect(resolveTheme(THEMES, null, "2", null)?.id).toBe("2");
  });

  it("skips a theme that does not exist anymore", () => {
    expect(resolveTheme(THEMES, "9", "2")?.id).toBe("2");
    expect(resolveTheme(THEMES, "9", "8")?.id).toBe("1");
    expect(resolveTheme(THEMES, null, "2", "9")?.id).toBe("2");
  });

  it("gives the look from before the themes without a default", () => {
    expect(resolveTheme([theme("2")], null, null)).toBeNull();
    expect(resolveLook([], "2", "3")).toBe(FALLBACK_LOOK);
  });
});

describe("slideLayout", () => {
  it("is the layout from before for the look from before", () => {
    expect(slideLayout(FALLBACK_LOOK)).toEqual(SLIDE_LAYOUT);
  });

  it("scales the largest text and keeps the smallest one below it", () => {
    expect(slideLayout({ ...FALLBACK_LOOK, textSize: 150 }).maxFont).toBeCloseTo(
      SLIDE_LAYOUT.maxFont * 1.5,
    );
    const small = slideLayout({ ...FALLBACK_LOOK, textSize: 50 });
    expect(small.maxFont).toBeCloseTo(SLIDE_LAYOUT.maxFont / 2);
    expect(small.minFont).toBe(small.maxFont);
  });

  it("has the margin and the width of the font", () => {
    const layout = slideLayout({ ...FALLBACK_LOOK, margin: 12, font: "oswald" });
    expect(layout.padding).toBe(0.12);
    expect(layout.charWidth).toBeLessThan(SLIDE_LAYOUT.charWidth);
  });

  it("scales the reference and leaves less space for the verses under a larger one", () => {
    const large = slideLayout({ ...FALLBACK_LOOK, referenceSize: 200 });
    expect(large.referenceFont).toBeCloseTo(SMALL_FONT * 2);
    expect(scriptureTextSpace(large)).toBeCloseTo(
      scriptureTextSpace() - SMALL_FONT * SLIDE_LAYOUT.lineHeight,
    );
  });
});

describe("transitionMs", () => {
  it("is 0 for a cut", () => {
    expect(
      transitionMs({ ...FALLBACK_LOOK, transition: { kind: "cut", ms: 500, rollMs: 600 } }),
    ).toBe(0);
    expect(
      transitionMs({ ...FALLBACK_LOOK, transition: { kind: "fade", ms: 500, rollMs: 600 } }),
    ).toBe(500);
  });
});
