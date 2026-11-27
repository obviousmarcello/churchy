import { canvasJpeg } from "./image-resize";
import { loadPdfjs, MAX_CANVAS_PIXELS, PDFJS_DOCUMENT_OPTIONS } from "./pdfjs";

// The pages of a PDF file as images, in the browser, e.g. for the images of
// an event: each page becomes a JPEG file, one after the other, so a long
// file does not use too much memory. The page has a white background, as on
// paper.

/** The browser cannot open the file: not a PDF, a damaged file, or a file with a password. */
export class PdfOpenError extends Error {
  constructor(readonly password: boolean) {
    super("The browser cannot open this PDF file");
    this.name = "PdfOpenError";
  }
}

/** The pages of a file as images, e.g. of a PDF file or of a PowerPoint file (see `pptx-slides.ts`). */
export type DocumentPages = {
  /** The number of pages. */
  count: number;
  /**
   * The page `number` (from 1) as a JPEG file, at most `maxSide` pixels on its
   * longest side. The JPEG uses each of `qualities` in turn until the file is
   * at most `maxBytes`. The last quality gives the file also when it is larger.
   */
  render(
    number: number,
    options: { maxSide: number; qualities: readonly number[]; maxBytes: number },
  ): Promise<Blob>;
  /** Frees the memory of the file. */
  close(): Promise<void>;
};

/** Opens the PDF file. Throws `PdfOpenError` when the browser cannot open it. */
export async function openPdfPages(file: Blob): Promise<DocumentPages> {
  const lib = await loadPdfjs();
  const task = lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    ...PDFJS_DOCUMENT_OPTIONS,
  });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => {});
    throw new PdfOpenError(error instanceof Error && error.name === "PasswordException");
  }

  return {
    count: doc.numPages,
    async render(number, { maxSide, qualities, maxBytes }) {
      const page = await doc.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(
        maxSide / Math.max(base.width, base.height),
        Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, base.width * base.height)),
      );
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      try {
        await page.render({ canvas, viewport, background: "#ffffff" }).promise;
        const blob = await canvasJpeg(canvas, qualities, maxBytes);
        if (!blob) throw new Error("The browser cannot save the page as an image");
        return blob;
      } finally {
        // Frees the memory of the canvas and of the page at once.
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    },
    async close() {
      await task.destroy().catch(() => {});
    },
  };
}
