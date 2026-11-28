import "server-only";

import { getMusicSupabase } from "@/server/music/db";

// The files that the browser uploads directly to Storage, e.g. PDFs and sound
// files. The app checks a stored file before a row uses it.

export type StoredFileStart = { sizeBytes: number; start: Uint8Array };

/**
 * The size and the first `bytes` bytes of a stored file, or null if there is
 * no such file. It does not download the full file. It does not check the
 * session: the caller does.
 */
export async function readStoredFileStart(
  bucket: string,
  path: string,
  bytes: number,
): Promise<StoredFileStart | null> {
  const storage = (await getMusicSupabase()).storage.from(bucket);
  const { data: info, error: infoError } = await storage.info(path);
  if (infoError || typeof info.size !== "number") return null;

  const { data: stream, error: downloadError } = await storage.download(path).asStream();
  if (downloadError) return null;
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const start = new Uint8Array(bytes);
  let length = 0;
  try {
    while (length < start.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value.subarray(0, start.length - length);
      start.set(part, length);
      length += part.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { sizeBytes: info.size, start: start.subarray(0, length) };
}

/**
 * The full content of a stored file, or null if there is no such file. Only
 * for small files, e.g. a sound file of at most `SOUND_FILE_MAX_BYTES`. It
 * does not check the session: the caller does.
 */
export async function readStoredFile(bucket: string, path: string): Promise<Uint8Array | null> {
  const { data, error } = await (await getMusicSupabase()).storage.from(bucket).download(path);
  if (error) return null;
  return new Uint8Array(await data.arrayBuffer());
}
