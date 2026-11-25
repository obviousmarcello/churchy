import { describe, expect, it } from "vitest";

import { textItemKind } from "./event-items";

describe("textItemKind", () => {
  const plain = { scripture: false, announcementId: null, imageSetId: null, textSlide: false };

  it("finds each kind", () => {
    expect(textItemKind(plain)).toBe("text");
    expect(textItemKind({ ...plain, scripture: true })).toBe("scripture");
    expect(textItemKind({ ...plain, announcementId: "a" })).toBe("announcements");
    expect(textItemKind({ ...plain, imageSetId: "i" })).toBe("images");
    expect(textItemKind({ ...plain, textSlide: true })).toBe("textSlide");
  });
});
