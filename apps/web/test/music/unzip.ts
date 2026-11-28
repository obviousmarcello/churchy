import { expect } from "vitest";

import { crc32 } from "@/lib/music/zip";

/** The entries of an archive with stored files, from its central directory. */
export function unzip(archive: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = archive.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let position = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(position, true)).toBe(0x02014b50);
    const crc = view.getUint32(position + 16, true);
    const size = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const offset = view.getUint32(position + 42, true);
    const name = decoder.decode(archive.subarray(position + 46, position + 46 + nameLength));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const start =
      offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const data = archive.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    entries.set(name, data);
    position += 46 + nameLength;
  }
  return entries;
}
