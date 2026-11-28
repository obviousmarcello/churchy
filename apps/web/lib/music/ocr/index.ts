import type { OcrEngine } from "./engine";

// The engine of the text recognition. This is the only file that names an
// engine: to use a different one, change only `loadOcrEngine`.
//
// A different engine, e.g. a model from Hugging Face, must:
// - extend `OcrEngine` and give the place of each word or line (e.g.
//   Florence-2 with `<OCR_WITH_REGION>`; TrOCR alone reads only one line and
//   needs a separate text detector);
// - run in a Web Worker, so the page stays responsive;
// - load its files from this site (see `scripts/copy-tesseract.mjs`), or the
//   Content Security Policy in `next.config.ts` must allow their site.

export type { OcrEngine, OcrPage, OcrProgress } from "./engine";
export { isAbortError } from "./engine";

let engine: Promise<OcrEngine> | null = null;

/**
 * The engine, loaded at the first call. Its code downloads only then, e.g.
 * when the user first taps "Read from image".
 */
export function loadOcrEngine(): Promise<OcrEngine> {
  engine ??= import("./tesseract-engine").then(({ TesseractEngine }) => new TesseractEngine());
  // A failed load tries again the next time.
  engine.catch(() => (engine = null));
  return engine;
}
