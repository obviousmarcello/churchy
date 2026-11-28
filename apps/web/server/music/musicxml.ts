import "server-only";

import { inflateRawSync } from "node:zlib";

// Reads an uploaded MusicXML file, to check it before the app stores it. A
// file is plain MusicXML (`.musicxml`) or compressed MusicXML (`.mxl`): a zip
// archive with the score and `META-INF/container.xml`, which names the score.
// The text is never given to an XML parser.

export type MusicXmlFile = {
  format: "mxl" | "musicxml";
  /** The score document. */
  xml: string;
};

/** The most bytes that a score in an archive can have. A real score is far smaller. */
const XML_MAX_BYTES = 20 * 1024 * 1024;

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_END = 0x06054b50;

/** The score of a MusicXML or compressed MusicXML file. Null for any other file. */
export function readMusicXml(bytes: Uint8Array): MusicXmlFile | null {
  if (bytes.length >= 4 && view(bytes).getUint32(0, true) === ZIP_LOCAL_HEADER) {
    const xml = readArchive(bytes);
    return xml !== null && isScore(xml) ? { format: "mxl", xml } : null;
  }

  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // MuseScore and other programs write UTF-8. Other text or binary data is not a score.
    return null;
  }
  return isScore(xml) ? { format: "musicxml", xml } : null;
}

/** A part-wise score: the format that MuseScore writes and that the sheet can show. */
function isScore(xml: string): boolean {
  // eslint-disable-next-line no-irregular-whitespace -- a byte order mark may start the file
  return /^\s*(?:﻿)?(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<score-partwise\b/.test(
    xml,
  );
}

/** The score in a compressed MusicXML archive, or null when the archive is not valid. */
function readArchive(bytes: Uint8Array): string | null {
  const entries = zipEntries(bytes);
  if (!entries) return null;

  const container = entries.get("META-INF/container.xml");
  // Without comments: a rootfile in a comment is not a rootfile, as for an XML parser.
  const containerXml = container
    ? entryText(bytes, container)?.replace(/<!--[\s\S]*?-->/g, "")
    : null;
  // The first rootfile is the score. XML permits both quotes around a value.
  const rootPath = containerXml
    ? /<rootfile\b[^>]*\bfull-path\s*=\s*(["'])([^"']+)\1/.exec(containerXml)?.[2]
    : undefined;
  const root = rootPath ? entries.get(rootPath) : undefined;
  return root ? entryText(bytes, root) : null;
}

type ZipEntry = { method: number; compressedSize: number; size: number; localOffset: number };

/** The files of a zip archive, by path. Null when the archive is not valid. */
function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> | null {
  const data = view(bytes);
  // The end record is in the last 22 bytes, before a comment of at most 65535 bytes.
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 22 - 0xffff);
    offset--
  ) {
    if (data.getUint32(offset, true) === ZIP_END) {
      end = offset;
      break;
    }
  }
  if (end < 0) return null;

  const count = data.getUint16(end + 10, true);
  let offset = data.getUint32(end + 16, true);
  const entries = new Map<string, ZipEntry>();
  for (let index = 0; index < count; index++) {
    if (offset + 46 > bytes.length || data.getUint32(offset, true) !== ZIP_CENTRAL_HEADER)
      return null;
    const nameLength = data.getUint16(offset + 28, true);
    const nameEnd = offset + 46 + nameLength;
    if (nameEnd > bytes.length) return null;
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, nameEnd));
    entries.set(name, {
      method: data.getUint16(offset + 10, true),
      compressedSize: data.getUint32(offset + 20, true),
      size: data.getUint32(offset + 24, true),
      localOffset: data.getUint32(offset + 42, true),
    });
    offset = nameEnd + data.getUint16(offset + 30, true) + data.getUint16(offset + 32, true);
  }
  return entries;
}

/** The text of a file in the archive. Null when it is too large, damaged or not UTF-8. */
function entryText(bytes: Uint8Array, entry: ZipEntry): string | null {
  if (entry.size > XML_MAX_BYTES) return null;
  const data = view(bytes);
  const header = entry.localOffset;
  if (header + 30 > bytes.length || data.getUint32(header, true) !== ZIP_LOCAL_HEADER) return null;
  const start = header + 30 + data.getUint16(header + 26, true) + data.getUint16(header + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.length) return null;
  const compressed = bytes.subarray(start, end);

  try {
    let content: Uint8Array;
    if (entry.method === 0) content = compressed;
    // The limit stops an archive that unpacks to much more than it says.
    else if (entry.method === 8)
      content = inflateRawSync(compressed, { maxOutputLength: XML_MAX_BYTES });
    else return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return null;
  }
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
