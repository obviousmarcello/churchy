/**
 * The bytes of a stream, or null when it has more than `max` bytes: the read
 * then stops and cancels the stream. A failed read (e.g. a network error, a
 * timeout or an upload that the client aborts) throws its error.
 */
export async function readAtMost(
  stream: ReadableStream<Uint8Array>,
  max: number,
): Promise<Buffer | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    size += part.value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}
