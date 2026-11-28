// The sound files of a song, e.g. a demo or a practice track. The browser
// plays them with its own player, so the app takes only the formats that
// most browsers play.
//
// Keep the types in sync with the `sound-files` bucket and the check of
// `song_sound_files.content_type` in the migrations.

export const SOUND_FILE_TYPES = [
  "audio/mpeg",
  "audio/aac",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/flac",
  "audio/webm",
] as const;

export type SoundFileType = (typeof SOUND_FILE_TYPES)[number];

/** The extensions of the formats, for the file field and for a file without a type. */
const EXTENSION_TYPES: Record<string, SoundFileType> = {
  mp3: "audio/mpeg",
  aac: "audio/aac",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  webm: "audio/webm",
  weba: "audio/webm",
};

/**
 * The extensions of a format, the usual one first. A download saves a file
 * with one of them (see `downloadFileName`).
 */
export function soundFileExtensions(type: SoundFileType): string[] {
  return Object.keys(EXTENSION_TYPES).filter((extension) => EXTENSION_TYPES[extension] === type);
}

/** Other names of the types, as browsers and systems give them. */
const TYPE_ALIASES: Record<string, SoundFileType> = {
  "audio/mp3": "audio/mpeg",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-aac": "audio/aac",
  "audio/opus": "audio/ogg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-flac": "audio/flac",
};

/** For the `accept` of a file field. */
export const SOUND_FILE_ACCEPT = [
  ...Object.keys(EXTENSION_TYPES).map((extension) => `.${extension}`),
  "audio/*",
].join(",");

/** The formats for the hint of the file field. */
export const SOUND_FILE_FORMAT_NAMES = "MP3, M4A, AAC, OGG, OPUS, WAV, FLAC";

/**
 * The type to upload a file with, from its extension, else from its type.
 * Null for a file in another format. The server checks the content again
 * (`soundFileTypeOf`).
 */
export function uploadTypeOf(file: { name: string; type: string }): SoundFileType | null {
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (extension && extension in EXTENSION_TYPES) return EXTENSION_TYPES[extension]!;
  const type = file.type.toLowerCase().split(";")[0]!.trim();
  if ((SOUND_FILE_TYPES as readonly string[]).includes(type)) return type as SoundFileType;
  return TYPE_ALIASES[type] ?? null;
}

/** The bytes at the start of a file that `soundFileTypeOf` needs. */
export const SOUND_FILE_HEADER_BYTES = 16;

/** The most zero bytes of padding after ID3 tags that `soundFileTypeOf` looks past. */
const ID3_PADDING_MAX_BYTES = 4096;

/** The brands of the images in an MP4 container (`ftyp`), e.g. HEIC photos of an iPhone. */
export const IMAGE_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "mif1",
  "msf1",
  "avif",
  "avis",
]);

/**
 * The format of a file, from its first bytes. Null for a file in another
 * format. The content decides, not the name. The first bytes of an MP4 or
 * WebM file do not tell a sound from a video: `hasVideoTrack` reads the
 * full file.
 */
export function soundFileTypeOf(start: Uint8Array): SoundFileType | null {
  const text = (offset: number, length: number) =>
    String.fromCharCode(...start.subarray(offset, offset + length));

  // ID3 tags: mostly of MP3, but also of FLAC and AAC. The format follows the
  // tags and their zero bytes of padding (see `soundFileHeaderBytes`). Other
  // bytes after the tags are not a sound file, and nor are tags without a
  // format after them: e.g. a tag size that goes past the end of the file, or
  // padding until the end of the bytes, after which anything can follow.
  if (isId3(start)) {
    const rest = start.subarray(id3TagBytes(start));
    const format = rest.findIndex((byte) => byte !== 0);
    return format < 0 ? null : soundFileTypeOf(rest.subarray(format));
  }
  // MP4 and M4A, but not the images of the same container, e.g. HEIC photos.
  if (text(4, 4) === "ftyp" && !IMAGE_BRANDS.has(text(8, 4))) return "audio/mp4";
  if (text(0, 4) === "OggS") return "audio/ogg";
  if (text(0, 4) === "RIFF" && text(8, 4) === "WAVE") return "audio/wav";
  if (text(0, 4) === "fLaC") return "audio/flac";
  if (start[0] === 0x1a && start[1] === 0x45 && start[2] === 0xdf && start[3] === 0xa3)
    return "audio/webm";
  // A frame of MPEG audio: 11 bits of sync. Layer 0 is AAC (ADTS), the others MP3.
  if (start.length >= 2 && start[0] === 0xff && (start[1]! & 0xe0) === 0xe0) {
    const layer = (start[1]! >> 1) & 0b11;
    return layer === 0 ? "audio/aac" : "audio/mpeg";
  }
  return null;
}

/**
 * The bytes at the start of a file that `soundFileTypeOf` needs to see the
 * format after the ID3 tags and their padding, from the first `SOUND_FILE_HEADER_BYTES`.
 */
export function soundFileHeaderBytes(start: Uint8Array): number {
  return isId3(start)
    ? id3TagBytes(start) + ID3_PADDING_MAX_BYTES + SOUND_FILE_HEADER_BYTES
    : SOUND_FILE_HEADER_BYTES;
}

function isId3(start: Uint8Array): boolean {
  return String.fromCharCode(...start.subarray(0, 3)) === "ID3";
}

/** The length of an ID3v2 tag: the header, the size (7 bits in each byte) and the footer, if any. */
function id3TagBytes(start: Uint8Array): number {
  if (start.length < 10) return start.length;
  const size =
    ((start[6]! & 0x7f) << 21) |
    ((start[7]! & 0x7f) << 14) |
    ((start[8]! & 0x7f) << 7) |
    (start[9]! & 0x7f);
  const footer = start[5]! & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

/** The formats that can hold a video, so the server reads their tracks (`hasVideoTrack`). */
export const VIDEO_CONTAINER_TYPES: readonly SoundFileType[] = ["audio/mp4", "audio/webm"];

/**
 * True if an MP4 or a WebM (Matroska) file has a video track, also after ID3
 * tags (as in `soundFileTypeOf`). False for a file in another format, and for
 * a file that it cannot read to the tracks. A cover picture of an M4A file is
 * not a track.
 */
export function hasVideoTrack(file: Uint8Array): boolean {
  if (isId3(file)) {
    const rest = file.subarray(id3TagBytes(file));
    const format = rest.findIndex((byte) => byte !== 0);
    return format >= 0 && hasVideoTrack(rest.subarray(format));
  }
  if (String.fromCharCode(...file.subarray(4, 8)) === "ftyp")
    return mp4HasVideo(file, 0, file.length);
  if (file[0] === 0x1a && file[1] === 0x45 && file[2] === 0xdf && file[3] === 0xa3) {
    return matroskaHasVideo(file, 0, file.length);
  }
  return false;
}

/** The boxes on the path to the handler of a track: `moov/trak/mdia/hdlr`. */
const MP4_PARENTS = new Set(["moov", "trak", "mdia"]);

function mp4HasVideo(file: Uint8Array, start: number, end: number): boolean {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(...file.subarray(offset + 4, offset + 8));
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return false;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header) return false;
    const boxEnd = Math.min(end, offset + size);
    // `hdlr`: version and flags, `pre_defined`, then the type of the track.
    if (
      type === "hdlr" &&
      String.fromCharCode(...file.subarray(offset + header + 8, offset + header + 12)) === "vide"
    ) {
      return true;
    }
    if (MP4_PARENTS.has(type) && mp4HasVideo(file, offset + header, boxEnd)) return true;
    offset += size;
  }
  return false;
}

const MATROSKA_SEGMENT = 0x18538067;
const MATROSKA_TRACKS = 0x1654ae6b;
const MATROSKA_TRACK_ENTRY = 0xae;
const MATROSKA_TRACK_TYPE = 0x83;
const MATROSKA_CLUSTER = 0x1f43b675;
const MATROSKA_VIDEO = 1;

function matroskaHasVideo(file: Uint8Array, start: number, end: number): boolean {
  let offset = start;
  while (offset < end) {
    const id = readVint(file, offset, true);
    if (!id) return false;
    const size = readVint(file, offset + id.length, false);
    if (!size) return false;
    const dataStart = offset + id.length + size.length;
    // A recording of a browser (`MediaRecorder`) does not write the size of the segment.
    const dataEnd = size.unknown ? end : Math.min(end, dataStart + size.value);

    if (id.value === MATROSKA_TRACK_TYPE) {
      if (readUint(file, dataStart, dataEnd) === MATROSKA_VIDEO) return true;
    } else if (
      id.value === MATROSKA_SEGMENT ||
      id.value === MATROSKA_TRACKS ||
      id.value === MATROSKA_TRACK_ENTRY
    ) {
      if (matroskaHasVideo(file, dataStart, dataEnd)) return true;
      // All tracks are read.
      if (id.value === MATROSKA_TRACKS) return false;
    } else if (id.value === MATROSKA_CLUSTER) {
      // The media data comes after the tracks.
      return false;
    }
    // The end of an element of unknown size is not known, so the next one is not either.
    if (size.unknown) return false;
    offset = dataEnd;
  }
  return false;
}

/**
 * A number of variable length (EBML): the count of leading zero bits of the
 * first byte tells the length. An ID keeps its marker bit, a size does not.
 * A size of only one bits is unknown.
 */
function readVint(
  file: Uint8Array,
  offset: number,
  isId: boolean,
): { value: number; length: number; unknown: boolean } | null {
  const first = file[offset];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23;
  if (offset + length > file.length) return null;
  const mask = 0xff >> length;
  let value = isId ? first : first & mask;
  let allOnes = (first & mask) === mask;
  for (let i = 1; i < length; i++) {
    value = value * 256 + file[offset + i]!;
    allOnes &&= file[offset + i] === 0xff;
  }
  return { value, length, unknown: !isId && allOnes };
}

function readUint(file: Uint8Array, start: number, end: number): number {
  let value = 0;
  for (let i = start; i < end; i++) value = value * 256 + file[i]!;
  return value;
}
