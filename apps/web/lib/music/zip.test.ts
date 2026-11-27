import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";

import { unzip } from "@/test/music/unzip";
import { crc32, zip } from "./zip";

describe("crc32", () => {
  it("is the same as the one of zlib", () => {
    for (const text of ["", "a", "Lorem ipsum dolor sit amet", "Árvíztűrő tükörfúrógép"]) {
      const data = new TextEncoder().encode(text);
      expect(crc32(data)).toBe(nodeCrc32(data));
    }
  });
});

describe("zip", () => {
  it("stores the entries in order, with UTF-8 names", () => {
    const archive = zip([
      { path: "a.txt", data: "Lorem" },
      { path: "dir/ű.bin", data: new Uint8Array([0, 1, 2, 255]) },
    ]);
    const entries = unzip(archive);
    expect([...entries.keys()]).toEqual(["a.txt", "dir/ű.bin"]);
    expect(new TextDecoder().decode(entries.get("a.txt"))).toBe("Lorem");
    expect([...entries.get("dir/ű.bin")!]).toEqual([0, 1, 2, 255]);
  });

  it("makes an empty archive", () => {
    expect(unzip(zip([])).size).toBe(0);
  });
});
