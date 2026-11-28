// The text recognition (OCR) of the app, as an abstract engine. It runs in
// the browser: an image never goes to a server for it. `loadOcrEngine()` in
// `./index.ts` gives the engine that the app uses. The rest of the app knows
// only the types of this file, so a different engine (e.g. a model from
// Hugging Face) can replace it there.

/** A rectangle on the image, in pixels of the image. */
export type OcrBox = { x: number; y: number; width: number; height: number };

/** A word with its place on the image. The places put each chord above the right syllable. */
export type OcrWord = { text: string; box: OcrBox; confidence?: number };

/** A line of words, from left to right. */
export type OcrLine = { words: OcrWord[]; box: OcrBox };

/** The text of one image, as lines in reading order. */
export type OcrPage = { width: number; height: number; lines: OcrLine[] };

/**
 * What the engine does now. `download`: it loads its files, the first time
 * only. `load`: it starts. `recognize`: it reads an image. `ratio` is from 0 to
 * 1, or null when the engine cannot say.
 */
export type OcrProgress = { stage: "download" | "load" | "recognize"; ratio: number | null };

export type OcrOptions = {
  /** Stops the work. The promise then fails with an `AbortError`. */
  signal?: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
};

/** A language that the engine reads. */
export type OcrLanguage = "hu";

export abstract class OcrEngine {
  /** For the logs, e.g. "tesseract". */
  abstract readonly id: string;
  abstract readonly languages: readonly OcrLanguage[];

  /** Loads the files and starts the engine. Call it once, before the first `recognize`. */
  abstract load(options?: OcrOptions): Promise<void>;

  /** Reads the text of an image (PNG, JPEG or WebP), with the place of each word. */
  abstract recognize(image: Blob, options?: OcrOptions): Promise<OcrPage>;

  /** Frees the memory of the engine. Call `load` again before the next `recognize`. */
  dispose(): void {}
}

/** The error of a stopped job, as `fetch` gives it. */
export function abortError(): DOMException {
  return new DOMException("The text recognition was stopped", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
