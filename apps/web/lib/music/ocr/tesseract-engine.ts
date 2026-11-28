import type Tesseract from "tesseract.js";

import {
  abortError,
  OcrEngine,
  type OcrBox,
  type OcrLine,
  type OcrOptions,
  type OcrPage,
  type OcrProgress,
} from "./engine";

// The text recognition with Tesseract.js: Tesseract as WebAssembly, in a Web
// Worker. It reads Hungarian text only (Churchy decision, PLAN 11.1) with the LSTM recognition.
//
// The files that it loads at run time are in `public/tesseract` (see
// `scripts/copy-tesseract.mjs`): by default, Tesseract.js loads them from a
// CDN, which the Content Security Policy blocks. The worker keeps the
// language data in IndexedDB after the first download.

const ASSETS = "/tesseract/";
/** The name of the language data in IndexedDB. Change it when the data changes, so that browsers load the new data. */
const CACHE_PATH = "tesseract-4.0.0_best_int";

export class TesseractEngine extends OcrEngine {
  readonly id = "tesseract";
  readonly languages = ["hu"] as const;
  private worker: Promise<Tesseract.Worker> | null = null;
  // The worker has one logger: it reports to the job that runs now.
  private onProgress: ((progress: OcrProgress) => void) | undefined;

  async load(options?: OcrOptions): Promise<void> {
    await this.withAbort(this.start(options), options?.signal);
  }

  async recognize(image: Blob, options?: OcrOptions): Promise<OcrPage> {
    const worker = await this.withAbort(this.start(options), options?.signal);
    this.onProgress = options?.onProgress;
    const [size, result] = await this.withAbort(
      Promise.all([imageSize(image), worker.recognize(image, {}, { blocks: true, text: false })]),
      options?.signal,
    );
    return toOcrPage(result.data, size);
  }

  override dispose(): void {
    const worker = this.worker;
    this.worker = null;
    void worker?.then((started) => started.terminate()).catch(() => undefined);
  }

  /** The worker, started at the first call. */
  private start(options?: OcrOptions): Promise<Tesseract.Worker> {
    this.onProgress = options?.onProgress;
    if (this.worker) return this.worker;

    const worker = (async () => {
      // The browser build: CommonJS, so the functions are on the default export. It reads `self`
      // when it loads, so it loads only here, in the browser.
      const { createWorker, OEM, PSM } = (await import("tesseract.js/dist/tesseract.min.js"))
        .default;
      const site = window.location.origin;
      const started = await createWorker(["hun"], OEM.LSTM_ONLY, {
        workerPath: `${site}${ASSETS}worker.min.js`,
        corePath: `${site}${ASSETS}core`,
        langPath: `${site}${ASSETS}lang`,
        cachePath: CACHE_PATH,
        gzip: true,
        // Loads the worker from its file, not from a copy in a blob URL.
        workerBlobURL: false,
        logger: (message) => this.onProgress?.(toProgress(message)),
      });
      // Automatic page layout. The spaces between words stay, so the columns of the chords stay too.
      await started.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
      });
      return started;
    })();
    this.worker = worker;
    // A failed start tries again the next time.
    worker.catch(() => {
      if (this.worker === worker) this.worker = null;
    });
    return worker;
  }

  /** The promise, or an `AbortError` when `signal` stops the job. Stopping ends the worker. */
  private withAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) {
      this.dispose();
      return Promise.reject(abortError());
    }
    return new Promise<T>((resolve, reject) => {
      const stop = () => {
        // Tesseract cannot stop a job: only the end of the worker stops it.
        this.dispose();
        reject(abortError());
      };
      signal.addEventListener("abort", stop, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
    });
  }
}

/** The parts of a Tesseract result that `toOcrPage` reads. */
type Bbox = { x0: number; y0: number; x1: number; y1: number };
type TesseractBlocks = {
  blocks:
    | {
        paragraphs: {
          lines: { bbox: Bbox; words: { text: string; confidence: number; bbox: Bbox }[] }[];
        }[];
      }[]
    | null;
};

/** The lines of a Tesseract result, in reading order, without empty words and lines. */
export function toOcrPage(data: TesseractBlocks, size: { width: number; height: number }): OcrPage {
  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const words = line.words
          .filter((word) => word.text.trim() !== "")
          .map((word) => ({
            text: word.text.trim(),
            box: toBox(word.bbox),
            confidence: word.confidence / 100,
          }));
        if (words.length > 0) lines.push({ words, box: toBox(line.bbox) });
      }
    }
  }
  return { ...size, lines };
}

/** The status texts of Tesseract.js, e.g. "loading language traineddata" or "recognizing text". */
export function toProgress(message: { status: string; progress: number }): OcrProgress {
  const stage = message.status.startsWith("recognizing")
    ? "recognize"
    : message.status.startsWith("loading")
      ? "download"
      : "load";
  return {
    stage,
    ratio: Number.isFinite(message.progress) ? Math.min(1, Math.max(0, message.progress)) : null,
  };
}

function toBox({ x0, y0, x1, y1 }: Bbox): OcrBox {
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

async function imageSize(image: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(image);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
