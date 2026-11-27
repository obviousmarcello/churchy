"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { useMediaQuery } from "@/lib/music/browser";
import { largestFit, type RollVerse, type SlideLayout } from "@/lib/music/projection/slides";
import type { ProjectionLook } from "@/lib/music/projection/themes";
import { cn } from "@/lib/music/utils";

// The roll view of the verses (see `scriptureRollSlide`): the live verses in
// the middle, the verses before them above and the verses after them below,
// muted. Each verse is a paragraph of its own. The text has one size, a part
// of the largest one of the look that the controller chooses
// (`ROLL_TEXT_SIZES`), so most steps only move it; it gets smaller only when
// the live verses do not fit in the middle.
//
// When the verses change, each verse moves from its old place to its new one
// (FLIP: the new layout, then a transform from the old place back to it). A
// new verse comes in with the move, and a verse that goes leaves with it as a
// copy. Without common verses, e.g. after a jump to another chapter, the old
// verses fade out and the new ones fade in. A change during a move starts
// where the text is. The move takes the roll time of the look
// (`transition.rollMs`), not its fade. No move for a roll time of 0 and with
// "reduce motion".

/** The opacity of the verses before and after the live ones. */
const MUTED_OPACITY = 0.3;
/** The most height of the live verses, as a part of the roll: the verses around them show above and below. */
const LIVE_SPACE = 0.7;
const ROLL_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
/** The verses fade out at the top and the bottom edge. */
const EDGE_FADE = "linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent)";

type Block = RollVerse & { live: boolean };

/** Where a verse shows, relative to the roll: its text size and opacity as they show, and a copy of it. */
type Place = {
  left: number;
  top: number;
  width: number;
  fontPx: number;
  opacity: number;
  /** The label and the text: a verse with another text, e.g. of another translation, is a new verse. */
  content: string;
  copy: Node;
};

/**
 * The verses with the verses around them, on the whole parent. `slide`: the
 * text sizes are parts of its height. `font`: the font of the parent.
 */
export function ScriptureRoll({
  slide,
  verses,
  roll,
  look,
  layout,
  font,
}: {
  slide: React.RefObject<HTMLDivElement | null>;
  verses: { label: string; text: string }[];
  roll: { ids: string[]; before: RollVerse[]; after: RollVerse[]; textSize: number };
  look: ProjectionLook;
  layout: SlideLayout;
  font: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  const places = useRef(new Map<string, Place>());
  const [ready, setReady] = useState(false);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const ms = reduceMotion ? 0 : look.transition.rollMs;
  // Prose: a centered paragraph is hard to read, so "center" is left here, as on the page view.
  const align = look.textAlign === "right" ? "right" : "left";
  const blocks: Block[] = [
    ...roll.before.map((verse) => ({ ...verse, live: false })),
    ...verses.map((verse, index) => ({
      id: roll.ids[index]!,
      label: verse.label,
      text: verse.text,
      live: true,
    })),
    ...roll.after.map((verse) => ({ ...verse, live: false })),
  ];
  const content = JSON.stringify(blocks);
  const { minFont, maxFont } = layout;
  const textScale = roll.textSize / 100;

  useLayoutEffect(() => {
    const viewportElement = viewport.current;
    const columnElement = column.current;
    const ghostLayer = ghosts.current;
    if (!viewportElement || !columnElement || !ghostLayer) return;
    let frame = 0;
    // Without a layout yet: e.g. on a new slide view, its ref comes after this effect.
    let placed = false;
    let active = true;
    const elements = () =>
      Array.from(columnElement.children).filter((child) => child instanceof HTMLElement);

    /** The places of the verses as they show now, also during a move. `copy`: new copies, after a layout. */
    const measure = (copy: boolean) => {
      const origin = viewportElement.getBoundingClientRect();
      const fontPx = parseFloat(columnElement.style.fontSize) || 0;
      const next = new Map<string, Place>();
      for (const element of elements()) {
        const id = element.dataset.rollId;
        if (!id) continue;
        const rect = element.getBoundingClientRect();
        const old = places.current.get(id);
        next.set(id, {
          left: rect.left - origin.left,
          top: rect.top - origin.top,
          width: rect.width,
          // A verse has the width of the roll: its width shows the scale of a move.
          fontPx: fontPx * (element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1),
          opacity: Number(getComputedStyle(element).opacity),
          content: element.textContent ?? "",
          copy: copy || !old ? element.cloneNode(true) : old.copy,
        });
      }
      places.current = next;
    };

    const place = (animate: boolean) => {
      cancelAnimationFrame(frame);
      const before = places.current;
      for (const element of elements())
        for (const animation of element.getAnimations()) animation.cancel();
      const slideHeight = slide.current?.clientHeight ?? 0;
      const height = viewportElement.clientHeight;
      const live = elements().filter((element) => element.dataset.live !== undefined);
      const first = live[0];
      const last = live.at(-1);
      if (slideHeight <= 0 || height <= 0 || !first || !last) return;

      // The text size of the roll, smaller when the live verses do not fit.
      const liveHeight = () => last.offsetTop + last.offsetHeight - first.offsetTop;
      const fitsAt = (px: number) => {
        columnElement.style.fontSize = `${px}px`;
        return (
          liveHeight() <= height * LIVE_SPACE &&
          columnElement.scrollWidth <= columnElement.clientWidth
        );
      };
      const px = largestFit(
        slideHeight * minFont * 0.25,
        slideHeight * Math.max(minFont, maxFont * textScale),
        fitsAt,
      );
      columnElement.style.fontSize = `${px}px`;
      // The middle of the live verses in the middle of the roll.
      columnElement.style.transform = `translateY(${height / 2 - first.offsetTop - liveHeight() / 2}px)`;
      measure(true);
      placed = true;
      setReady(true);
      const after = places.current;
      if (!animate || ms === 0 || before.size === 0) return;

      const same = (id: string) => {
        const old = before.get(id);
        return old !== undefined && old.content === after.get(id)?.content;
      };
      // The move of the verses that stay. None: the old verses fade out, and the new ones fade in.
      const moves = [...after].flatMap(([id, now]) => {
        const old = before.get(id);
        return old && same(id) ? [now.top - old.top] : [];
      });
      const move = moves.sort((a, b) => a - b)[Math.floor(moves.length / 2)] ?? 0;
      const timing = { duration: ms, easing: ROLL_EASING };
      const x = (place: Place) => (align === "left" ? place.left : place.left + place.width);

      for (const element of elements()) {
        const id = element.dataset.rollId ?? "";
        const now = after.get(id);
        const old = before.get(id);
        if (!now) continue;
        const from =
          old && same(id)
            ? {
                transform: `translate(${x(old) - x(now)}px, ${old.top - now.top}px) scale(${old.fontPx / px})`,
                opacity: old.opacity,
              }
            : { transform: `translateY(${-move}px)`, opacity: 0 };
        element.animate([from, { transform: "none", opacity: now.opacity }], timing);
      }
      for (const [id, old] of before) {
        if (same(id)) continue;
        const ghost = old.copy.cloneNode(true);
        if (!(ghost instanceof HTMLElement)) continue;
        delete ghost.dataset.rollId;
        Object.assign(ghost.style, {
          position: "absolute",
          left: `${old.left}px`,
          top: `${old.top}px`,
          width: `${old.width}px`,
          fontSize: `${old.fontPx}px`,
          opacity: "0",
        });
        ghostLayer.append(ghost);
        const animation = ghost.animate(
          [
            { transform: "none", opacity: old.opacity },
            { transform: `translateY(${move}px)`, opacity: 0 },
          ],
          timing,
        );
        animation.onfinish = animation.oncancel = () => ghost.remove();
      }

      // During the move, the places follow the text: a change during it starts where the text is.
      const end = performance.now() + ms;
      const follow = () => {
        measure(false);
        if (performance.now() < end) frame = requestAnimationFrame(follow);
      };
      frame = requestAnimationFrame(follow);
    };

    place(true);
    // A new size of the screen, and a font that loads later, with other widths: at once, without a move.
    // The first call of the observer also lays out the verses that have no layout yet.
    let size = `${viewportElement.clientWidth}x${viewportElement.clientHeight}`;
    const observer = new ResizeObserver(() => {
      const next = `${viewportElement.clientWidth}x${viewportElement.clientHeight}`;
      if (next === size && placed) return;
      size = next;
      place(false);
    });
    observer.observe(viewportElement);
    if (document.fonts && document.fonts.status !== "loaded")
      void document.fonts.ready.then(() => active && place(false));
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [slide, content, font, minFont, maxFont, textScale, ms, align]);

  const transformOrigin = align === "left" ? "0 0" : "100% 0";
  return (
    <div
      ref={viewport}
      className="relative size-full overflow-hidden"
      style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE, textAlign: align }}
    >
      <div
        ref={column}
        // Hidden until the first layout, so the text does not jump.
        className={cn("absolute inset-x-0 top-0 flex flex-col text-pretty", !ready && "invisible")}
        style={{ lineHeight: layout.lineHeight, gap: `${layout.paragraphGap}em` }}
      >
        {blocks.map((block) => (
          <p
            key={block.id}
            data-roll-id={block.id}
            data-live={block.live ? "" : undefined}
            style={{ opacity: block.live ? 1 : MUTED_OPACITY, transformOrigin }}
          >
            <sup
              className="mr-[0.2em] text-[0.55em] font-semibold opacity-60"
              style={
                block.live && look.accentColor ? { color: look.accentColor, opacity: 1 } : undefined
              }
            >
              {block.label}
            </sup>
            {block.text}
          </p>
        ))}
      </div>
      {/* The verses that go, during their move. */}
      <div
        ref={ghosts}
        aria-hidden
        className="pointer-events-none absolute inset-0 text-pretty"
        style={{ lineHeight: layout.lineHeight }}
      />
    </div>
  );
}
