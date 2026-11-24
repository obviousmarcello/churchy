// pdf.js, loaded once at the first PDF, e.g. by the PDF viewer and by the
// upload of a PDF to the images of an event. Only in the browser.
//
// The files that pdf.js loads at run time are in `public/pdfjs` (see
// `scripts/copy-pdfjs.mjs`). The legacy build also works in the browsers of
// the last years, e.g. an older iPad.

export const PDFJS_ASSETS = "/pdfjs/";

/** The options of `getDocument` for the files of pdf.js on this site. */
export const PDFJS_DOCUMENT_OPTIONS = {
  wasmUrl: `${PDFJS_ASSETS}wasm/`,
  cMapUrl: `${PDFJS_ASSETS}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_ASSETS}standard_fonts/`,
  iccUrl: `${PDFJS_ASSETS}iccs/`,
};

/** Browsers limit the size of a canvas, e.g. to 16 million pixels on iOS. Stay below it. */
export const MAX_CANVAS_PIXELS = 16_000_000;

import type * as PdfjsModule from "pdfjs-dist";

export type PdfjsLib = typeof PdfjsModule;

let pdfjs: Promise<PdfjsLib> | null = null;

export function loadPdfjs(): Promise<PdfjsLib> {
  pdfjs ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((lib: PdfjsLib) => {
    lib.GlobalWorkerOptions.workerSrc = `${PDFJS_ASSETS}pdf.worker.min.mjs`;
    return lib;
  });
  // A failed load tries again the next time.
  pdfjs.catch(() => (pdfjs = null));
  return pdfjs;
}
