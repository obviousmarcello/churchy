import { z } from "zod";

// The zoom of a PDF file or an image on the sheet, and the part of the page
// that shows. Each user has one for each file: it is the same on all the
// pages of the file and on all devices. The values are in parts of the page,
// so a page of another size on the screen shows the same part.

export const FILE_ZOOM_MAX = 6;

/**
 * `zoom`: 1 shows the whole page. `x` and `y`: the point of the page at the
 * center of its box, from 0 (left, top) to 1 (right, bottom).
 */
export type FileView = { zoom: number; x: number; y: number };

/** The whole page. A file without a stored view shows like this. */
export const FIT_VIEW: FileView = { zoom: 1, x: 0.5, y: 0.5 };

/** A zoom this near 1 shows the whole page. */
const FIT_MARGIN = 0.02;

export const fileViewSchema = z.object({
  zoom: z.number().min(1).max(FILE_ZOOM_MAX),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

/** A point in the box of a page, in parts of its width and height. */
export type BoxPoint = { x: number; y: number };

export function isFitView(view: FileView): boolean {
  return view.zoom <= 1 + FIT_MARGIN;
}

export function sameView(a: FileView, b: FileView): boolean {
  return a.zoom === b.zoom && a.x === b.x && a.y === b.y;
}

/** The view with the zoom in its range, and no empty space at the sides of the page. */
export function clampView({ zoom, x, y }: FileView): FileView {
  const clamped = Math.min(Math.max(zoom, 1), FILE_ZOOM_MAX);
  if (!Number.isFinite(clamped) || isFitView({ zoom: clamped, x, y })) return FIT_VIEW;
  const half = 1 / (2 * clamped);
  const center = (value: number) =>
    Number.isFinite(value) ? Math.min(Math.max(value, half), 1 - half) : 0.5;
  return { zoom: clamped, x: center(x), y: center(y) };
}

/**
 * The view after a pinch: the point of the page at `from` in the box moves
 * to `to`, and the zoom multiplies by `factor`. Also a zoom around a point
 * (`from` = `to`) and a move (`factor` = 1).
 */
export function pinchView(start: FileView, from: BoxPoint, to: BoxPoint, factor: number): FileView {
  const zoom = Math.min(Math.max(start.zoom * factor, 1), FILE_ZOOM_MAX);
  // The point of the page under `from`.
  const pageX = start.x + (from.x - 0.5) / start.zoom;
  const pageY = start.y + (from.y - 0.5) / start.zoom;
  return clampView({ zoom, x: pageX - (to.x - 0.5) / zoom, y: pageY - (to.y - 0.5) / zoom });
}

/**
 * The CSS transform (with the origin at the top left) that moves a page,
 * drawn with the view `drawn`, to the view `view`. The box is `width` ×
 * `height` CSS pixels. Without `drawn`, from the whole page.
 */
export function viewTransform(
  view: FileView,
  width: number,
  height: number,
  drawn: FileView = FIT_VIEW,
): string {
  const scale = view.zoom / drawn.zoom;
  // The top left corner of the drawn page, in parts of the box.
  const left = 0.5 - view.x * view.zoom - scale * (0.5 - drawn.x * drawn.zoom);
  const top = 0.5 - view.y * view.zoom - scale * (0.5 - drawn.y * drawn.zoom);
  if (scale === 1 && Math.abs(left * width) < 0.01 && Math.abs(top * height) < 0.01) return "";
  return `translate(${left * width}px, ${top * height}px) scale(${scale})`;
}
