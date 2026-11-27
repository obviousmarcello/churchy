import type { ProjectionState } from "./protocol";
import type { ProjectionSlide } from "./slides";
import { TEXT_SIZE_MIN, type ProjectionLook } from "./themes";

// The stream overlay of a projection: the text of the slides at the bottom,
// for the keyer of a video switcher, e.g. an ATEM. A computer sends the page
// in full screen to an input of the switcher. On black, a luma key removes
// the background; on green, a chroma key. It shows only the lyrics, the
// scripture readings, the song titles with their copyright, the titles of the
// text items (the `caption` of their blank slide) and the texts of the text
// slides: the images, the QR codes and the announcements are for the room,
// and the announcements can contain the names of people.
//
// The controllers can show the lyrics on the overlay in smaller steps: each
// lyrics slide in parts of `STREAM_LINES` lines (see `streamParts`). The
// state carries the lines of a part (`streamLines`), so that all the
// controllers split the slides in the same way, and the part (`stream`). The
// screens keep the whole slide.

const OVERLAY_BACKGROUNDS = ["black", "green"] as const;
export type OverlayBackground = (typeof OVERLAY_BACKGROUNDS)[number];

/** The colors of the backgrounds: black for a luma key, pure green for a chroma key. */
export const OVERLAY_COLORS: Record<OverlayBackground, string> = {
  black: "#000000",
  green: "#00ff00",
};

/** The background from the query. "black" for a missing or unknown value. */
export function parseOverlayBackground(param: string | undefined): OverlayBackground {
  return OVERLAY_BACKGROUNDS.find((background) => background === param) ?? "black";
}

/** The lines of a part of a lyrics slide on the overlay, when the operator turns the parts on. */
export const STREAM_LINES = 2;

/**
 * The parts of a lyrics slide for the overlay: the lines of each paragraph in
 * parts of `lines`. A part never goes across two paragraphs, e.g. 5 lines in
 * parts of 2 give 2, 2 and 1. Null for another slide and for lyrics without
 * lines: one step.
 */
export function streamParts(slide: ProjectionSlide, lines: number): string[][] | null {
  if (slide.kind !== "lyrics" || lines < 1) return null;
  const parts = slide.paragraphs.flatMap((paragraph) =>
    Array.from({ length: Math.ceil(paragraph.length / lines) }, (_, index) =>
      paragraph.slice(index * lines, (index + 1) * lines),
    ),
  );
  return parts.length > 0 ? parts : null;
}

/**
 * The index of the part on the overlay (`stream`) in `parts`, from 0. The
 * lines decide, not only the index from the state: another controller can
 * split the slide in another way, e.g. for another screen shape. With the
 * same lines more than once, `hint` (`streamPart` of the state) chooses.
 * Without such lines, `hint` in the range of `parts`.
 */
export function streamPartIndex(
  parts: string[][],
  stream: string[],
  hint: number | undefined,
): number {
  const same = (part: string[]) =>
    part.length === stream.length && part.every((line, index) => line === stream[index]);
  const matches = parts.flatMap((part, index) => (same(part) ? [index] : []));
  if (hint !== undefined && matches.includes(hint)) return hint;
  return matches[0] ?? Math.min(hint ?? 0, parts.length - 1);
}

/**
 * The slide that the overlay shows: the part of the lyrics (`stream`), or
 * the slide; the title of a text item as a text. Null for a slide of the
 * room, and in the modes "black" and "clear".
 */
export function overlaySlide(
  state: Pick<ProjectionState, "mode" | "slide" | "stream">,
): ProjectionSlide | null {
  if (state.mode !== "show") return null;
  const { slide } = state;
  if (state.stream && slide.kind === "lyrics")
    return { kind: "lyrics", paragraphs: [state.stream] };
  if (slide.kind === "blank")
    return slide.caption ? { kind: "text", paragraphs: [[slide.caption]], highlight: [] } : null;
  // The page view of the verses: the roll is for the room.
  if (slide.kind === "scripture" && slide.roll)
    return { kind: "scripture", verses: slide.verses, reference: slide.reference };
  return slide.kind === "lyrics" ||
    slide.kind === "scripture" ||
    slide.kind === "title" ||
    slide.kind === "text"
    ? slide
    : null;
}

/**
 * The look of the overlay: the font and the transition of the theme, with
 * white text and a strong shadow, so the text is clear on each video. White
 * gives a full luma key; the keyer removes the shadow on black. For the same
 * reason the highlighted text of a text slide is white too, in bold. The
 * smallest text size of the themes: a short text stays in the lower third of
 * the video, and a long one goes higher before it gets smaller. The reference
 * of a scripture slide has its default size: never larger than the verses.
 */
export function overlayLook(look: ProjectionLook): ProjectionLook {
  return {
    ...look,
    background: { color: "transparent", image: null, video: null, dim: 0 },
    textColor: "#ffffff",
    accentColor: null,
    textSize: TEXT_SIZE_MIN,
    referenceSize: 100,
    textAlign: "center",
    verticalAlign: "bottom",
    textShadow: "strong",
    margin: 6,
  };
}
