import { describe, expect, it } from "vitest";

import { looksLikeScriptureReference, textItemKind } from "./event-items";

describe("looksLikeScriptureReference", () => {
  it.each([
    "John 3:16",
    "1 Kor 13",
    "1Móz 1,1–5",
    "2. Kor 5,17",
    "Zsolt 23",
    "Ps. 23:1-6; 24",
    "ApCsel 2,1-4",
  ])("finds %s", (text) => expect(looksLikeScriptureReference(text)).toBe(true));

  it.each(["Ima", "Hirdetések", "", "3:16", "Adomány a 2 missziónak", "Ének 4"])(
    "does not find %s",
    (text) => expect(looksLikeScriptureReference(text)).toBe(false),
  );
});

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
