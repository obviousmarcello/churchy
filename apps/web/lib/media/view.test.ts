import { MediaCreateInputSchema, type Media } from "@churchy/contracts";
import { describe, expect, it } from "vitest";
import { toCreateInput, toMediaItem } from "./view";

const upload = {
  filename: "orgona.jpg",
  mimeType: "image/jpeg",
  bytes: 2_400_000,
  width: 4000,
  height: 3000,
  alt: "Az orgona a karzaton",
  decorative: false,
  caption: null,
  peopleConsent: false,
};

describe("toCreateInput", () => {
  it("maps an image upload to a valid media row pointing at the placeholder", () => {
    const input = toCreateInput(upload);
    expect(MediaCreateInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({ kind: "image", storageKey: "demo/templom.svg" });
  });

  it("maps a PDF and unknown files", () => {
    expect(toCreateInput({ ...upload, mimeType: "application/pdf" }).kind).toBe("pdf");
    expect(toCreateInput({ ...upload, mimeType: "audio/mpeg" }).kind).toBe("other");
  });

  it("keeps the contract rule: an image needs alt text or must be decorative", () => {
    const bad = toCreateInput({ ...upload, alt: null });
    expect(MediaCreateInputSchema.safeParse(bad).success).toBe(false);
    expect(
      MediaCreateInputSchema.safeParse(toCreateInput({ ...upload, alt: null, decorative: true }))
        .success,
    ).toBe(true);
  });
});

describe("toMediaItem", () => {
  const row = {
    id: "m1",
    tenantId: "t1",
    kind: "image",
    filename: "a.svg",
    storageKey: "demo/templom.svg",
    alt: "x",
    decorative: false,
    caption: null,
    peopleConsent: true,
    width: 10,
    height: 10,
    bytes: 5,
  } as unknown as Media;

  it("serves only demo placeholders", () => {
    expect(toMediaItem(row).src).toBe("/demo/templom.svg");
    expect(toMediaItem({ ...row, storageKey: "t/t1/../../etc" } as Media).src).toBeNull();
    expect(toMediaItem({ ...row, kind: "pdf" } as Media).src).toBeNull();
  });
});
