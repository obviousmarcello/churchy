import { canvasJpeg } from "./image-resize";
import type { DocumentPages } from "./pdf-pages";
import { MAX_CANVAS_PIXELS, PDFJS_ASSETS } from "./pdfjs";

// The slides of a PowerPoint file (.pptx) as images, in the browser, e.g. for
// the images of an event. The file does not go to a server for it. A renderer
// (`@aiden0z/pptx-renderer`) draws each slide as HTML and SVG on a hidden part
// of the page, and `html-to-image` makes a JPEG file of it, one slide after
// the other. A slide can look a little different than in PowerPoint, e.g.
// with a font that the device does not have, or with an effect that the
// renderer does not know. A PDF export of the file gives the exact look.

/** The browser cannot open the file: not a PowerPoint file, or a damaged one. */
export class PptxOpenError extends Error {
  constructor() {
    super("The browser cannot open this PowerPoint file");
    this.name = "PptxOpenError";
  }
}

/** Opens the PowerPoint file. Throws `PptxOpenError` when the browser cannot open it. */
export async function openPptxSlides(file: Blob): Promise<DocumentPages> {
  // Only when a user adds a PowerPoint file: the libraries are large.
  const [{ buildPresentation, parseZip, renderSlide, RECOMMENDED_ZIP_LIMITS }, { toCanvas }] =
    await Promise.all([import("@aiden0z/pptx-renderer"), import("html-to-image")]);
  let presentation: ReturnType<typeof buildPresentation>;
  try {
    presentation = buildPresentation(
      await parseZip(await file.arrayBuffer(), RECOMMENDED_ZIP_LIMITS),
    );
  } catch {
    throw new PptxOpenError();
  }
  const { width, height } = presentation;

  // Out of the view, but with its full size: the renderer measures the text.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    top: "0",
    left: "-100000px",
    width: `${width}px`,
    height: `${height}px`,
    overflow: "hidden",
    pointerEvents: "none",
  });
  document.body.append(host);
  // The pictures of the file as blob URLs, shared by the slides.
  const mediaUrls = new Map<string, string>();

  return {
    count: presentation.slides.length,
    async render(number, { maxSide, qualities, maxBytes }) {
      const slide = presentation.slides[number - 1];
      if (!slide) throw new Error("No such slide");
      const handle = renderSlide(presentation, slide, {
        // Only the pictures in the file: a link to another site must not load.
        externalMedia: "block",
        mediaUrlCache: mediaUrls,
        pdfjs: {
          moduleUrl: `${PDFJS_ASSETS}pdf.min.mjs`,
          workerUrl: `${PDFJS_ASSETS}pdf.worker.min.mjs`,
        },
      });
      host.replaceChildren(handle.element);
      let canvas: HTMLCanvasElement | null = null;
      try {
        await handle.ready;
        await document.fonts.ready;
        await Promise.all(
          [...handle.element.querySelectorAll("img")].map((image) =>
            image.decode().catch(() => {}),
          ),
        );
        const pixelRatio = Math.min(
          maxSide / Math.max(width, height),
          Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, width * height)),
        );
        canvas = await toCanvas(handle.element, {
          width,
          height,
          pixelRatio,
          backgroundColor: "#ffffff",
        });
        const blob = await canvasJpeg(canvas, qualities, maxBytes);
        if (!blob) throw new Error("The browser cannot save the slide as an image");
        return blob;
      } finally {
        // Frees the memory of the canvas and of the slide at once.
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        handle.dispose();
        host.replaceChildren();
      }
    },
    async close() {
      host.remove();
      for (const url of mediaUrls.values()) URL.revokeObjectURL(url);
      mediaUrls.clear();
    },
  };
}
