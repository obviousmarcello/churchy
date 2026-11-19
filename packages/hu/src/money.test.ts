import { describe, expect, it } from "vitest";
import { formatHuf } from "./money";

describe("formatHuf", () => {
  it("groups thousands with no-break spaces and appends Ft", () => {
    expect(formatHuf(0)).toBe("0 Ft");
    expect(formatHuf(990)).toBe("990 Ft");
    expect(formatHuf(4990)).toBe("4 990 Ft");
    expect(formatHuf(1249000)).toBe("1 249 000 Ft");
  });

  it("rounds to whole forints and marks negatives with a minus sign", () => {
    expect(formatHuf(1999.6)).toBe("2 000 Ft");
    expect(formatHuf(-4990)).toBe("−4 990 Ft");
    expect(formatHuf(-0.2)).toBe("0 Ft");
  });

  it("rejects non-finite amounts", () => {
    expect(() => formatHuf(Number.NaN)).toThrow(RangeError);
  });
});
