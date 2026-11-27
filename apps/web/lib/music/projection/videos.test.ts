import { describe, expect, it } from "vitest";

import { projectionVideoTypeOf } from "./videos";

const bytes = (text: string) => [...text].map((char) => char.charCodeAt(0));
const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 0x18, ...bytes("ftyp"), ...bytes(brand)]);

describe("projectionVideoTypeOf", () => {
  it("knows MP4 (also MOV) and WebM videos by their first bytes", () => {
    expect(projectionVideoTypeOf(ftyp("isom"))).toBe("video/mp4");
    expect(projectionVideoTypeOf(ftyp("qt  "))).toBe("video/mp4");
    expect(projectionVideoTypeOf(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f]))).toBe(
      "video/webm",
    );
  });

  it("refuses images in the MP4 container and other files", () => {
    expect(projectionVideoTypeOf(ftyp("heic"))).toBeNull();
    expect(projectionVideoTypeOf(ftyp("avif"))).toBeNull();
    expect(projectionVideoTypeOf(new Uint8Array(bytes("%PDF-1.7 lorem")))).toBeNull();
    expect(projectionVideoTypeOf(new Uint8Array(bytes("ID3")))).toBeNull();
    expect(projectionVideoTypeOf(new Uint8Array())).toBeNull();
  });
});
