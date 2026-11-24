// Makes a photo smaller in the browser, e.g. before an upload or before the
// text recognition. A phone photo is often larger than a request can be.
//
// The browser draws the photo on a canvas, upright as it was taken, and saves
// the canvas as a new JPEG file. The new file has no metadata, e.g. no GPS
// position. Only the browser decodes the original, so a format that only the
// device knows (e.g. HEIC on an iPhone) also works there.

/** The browser cannot decode the file, e.g. a HEIC photo in a desktop browser. */
export class ImageDecodeError extends Error {
  constructor() {
    super("The browser cannot decode this image");
    this.name = "ImageDecodeError";
  }
}

/**
 * The image as a JPEG file, at most `maxSide` pixels on its longest side,
 * upright, without metadata. A smaller image keeps its size. The JPEG uses
 * each of `qualities` in turn until the file is at most `maxBytes`: the photo
 * is decoded only once. The last quality gives the file also when it is larger.
 */
export async function resizeImage(
  file: Blob,
  {
    maxSide,
    qualities = [0.85],
    maxBytes = Infinity,
  }: { maxSide: number; qualities?: readonly number[]; maxBytes?: number },
): Promise<{ blob: Blob; width: number; height: number }> {
  const source = await decode(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageDecodeError();
    // A photo of a sheet with transparency (a PNG) gets a white page, as on paper.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(source.image, 0, 0, width, height);

    let blob: Blob | null = null;
    try {
      for (const quality of qualities) {
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (!blob || blob.size <= maxBytes) break;
      }
    } finally {
      // Frees the memory of the canvas at once, e.g. on an older iPhone.
      canvas.width = 0;
      canvas.height = 0;
    }
    if (!blob) throw new ImageDecodeError();
    return { blob, width, height };
  } finally {
    source.close();
  }
}

/**
 * The canvas as a JPEG file. The JPEG uses each of `qualities` in turn until
 * the file is at most `maxBytes`; the last quality gives the file also when it
 * is larger. Null when the browser cannot save the canvas.
 */
export async function canvasJpeg(
  canvas: HTMLCanvasElement,
  qualities: readonly number[],
  maxBytes: number,
): Promise<Blob | null> {
  let blob: Blob | null = null;
  for (const quality of qualities) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size <= maxBytes) break;
  }
  return blob;
}

type Decoded = { image: CanvasImageSource; width: number; height: number; close: () => void };

// `createImageBitmap` is fast and works off the main thread. Some browsers
// cannot decode some formats with it, but can show them in an image element,
// e.g. Safari with HEIC. Both turn the photo as the camera held it.
async function decode(file: Blob): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    // Try the image element below.
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth === 0 || image.naturalHeight === 0) throw new ImageDecodeError();
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageDecodeError();
  }
}
