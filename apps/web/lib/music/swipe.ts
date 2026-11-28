// A short, fast, horizontal finger move turns a page. A slow or mostly
// vertical move does not: it is probably a scroll or a text selection.

/** The shortest swipe, in CSS pixels. */
export const SWIPE_MIN_PX = 50;
/** The longest swipe, in milliseconds. */
export const SWIPE_MAX_MS = 600;
/** A swipe moves this many times more across than up or down. */
const SWIPE_RATIO = 1.5;

/**
 * The page step of a finger move: 1 for a swipe to the left (the next page),
 * -1 for a swipe to the right (the previous page), 0 for no swipe.
 */
export function swipeStep(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (ms > SWIPE_MAX_MS) return 0;
  if (Math.abs(dx) < SWIPE_MIN_PX) return 0;
  if (Math.abs(dx) <= SWIPE_RATIO * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}
