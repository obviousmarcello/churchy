import { ocrToChordPro } from "@/lib/music/chordpro-ocr";
import { abortError, type OcrEngine, type OcrProgress } from "./engine";

/** The progress of `readChart`: the stage of the engine, at the image `page` of `count` (from 1). */
export type ReadChartProgress = OcrProgress & { page: number; count: number };

/**
 * Reads a chord sheet from the images, in order, as one ChordPro chart. Each
 * image is one page of the sheet. It starts the engine first, which can take
 * a download the first time.
 */
export async function readChart(
  engine: OcrEngine,
  images: Blob[],
  {
    signal,
    onProgress,
  }: { signal?: AbortSignal; onProgress?: (progress: ReadChartProgress) => void } = {},
): Promise<string> {
  const count = images.length;
  await engine.load({
    signal,
    onProgress: (progress) => onProgress?.({ ...progress, page: 1, count }),
  });

  const pages = [];
  for (const [index, image] of images.entries()) {
    if (signal?.aborted) throw abortError();
    pages.push(
      await engine.recognize(image, {
        signal,
        onProgress: (progress) => onProgress?.({ ...progress, page: index + 1, count }),
      }),
    );
  }
  return ocrToChordPro(pages);
}
