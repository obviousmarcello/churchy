"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { fontFamily } from "@/lib/music/projection/fonts";
import { BACKGROUND_BLUR, imageBox, type ImageBox } from "@/lib/music/projection/images";
import type { ProjectionMode } from "@/lib/music/projection/protocol";
import {
  HIGHLIGHT_SCALE,
  largestFit,
  slideLayout,
  type ProjectionSlide,
  type SlideLayout,
} from "@/lib/music/projection/slides";
import { FALLBACK_LOOK, textShadowCss, type ProjectionLook } from "@/lib/music/projection/themes";
import { cn } from "@/lib/music/utils";
import { QrCode } from "./qr-code";
import { ScriptureRoll } from "./scripture-roll";

// A slide as the screens show it, in the look of its projection theme: the
// background (a color, and an image or a video with black over it), and the text as
// large as fits. The controller and the theme editor show the same, smaller.
// The sizes are parts of the height of the slide (`cqh`), so a small slide
// looks the same as a large one. The page must define the font variables
// (`projectionFontVariables`). An image of the gallery covers the whole
// slide with its own background: a color, or the same image blurred. Or it
// shows the background of the look around it (see `imageBox`). An image of
// an announcement with a QR code takes 2/3 of the slide, and the QR code the
// other third: side by side, or one over the other on a portrait screen. The
// lists of announcements show the highlighted entries in the accent color of
// the look, else in bold with a marker. The highlighted text of a text slide
// is larger and bold, in the accent color when the look has one. Verses with
// a roll show as a roll (see `scripture-roll.tsx`).

/** Before a highlighted announcement when the look has no accent color. Not a text: it is the same in each language. */
const ACCENT_MARKER = "▸ ";

const VERTICAL_ALIGN_CLASSES: Record<ProjectionLook["verticalAlign"], string> = {
  top: "items-start",
  center: "items-center",
  bottom: "items-end",
};

/**
 * The background and the text. Fills its parent, which must have a size.
 * "black": all black, without the theme. "clear": the background without text.
 * `playVideo`: see `SlideBackground`.
 */
export function SlideView({
  slide,
  mode = "show",
  look = FALLBACK_LOOK,
  playVideo = false,
  className,
}: {
  slide: ProjectionSlide;
  mode?: ProjectionMode;
  look?: ProjectionLook;
  playVideo?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative size-full overflow-hidden bg-black", className)}>
      <SlideBackground look={look} mode={mode} playVideo={playVideo} />
      <SlideText slide={slide} look={look} mode={mode} />
    </div>
  );
}

/**
 * The background of the look, on the whole parent. All black in the mode
 * "black". The video of the look plays only with `playVideo`, e.g. on the
 * screens and in the live preview: else its poster (the image) shows, so a
 * list of slides does not play many videos.
 */
export function SlideBackground({
  look,
  mode = "show",
  playVideo = false,
}: {
  look: ProjectionLook;
  mode?: ProjectionMode;
  playVideo?: boolean;
}) {
  if (mode === "black") return <div className="absolute inset-0 bg-black" />;
  const { color, image, video, dim } = look.background;
  return (
    <div className="absolute inset-0" style={{ backgroundColor: color }}>
      {image && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a private file: the image optimizer cannot read it. */}
          <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
          {playVideo && video && <BackgroundVideo key={video} src={video} />}
          {dim > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: dim / 100 }} />}
        </>
      )}
    </div>
  );
}

/**
 * A background video: muted, again and again, over its poster. It fades in
 * when it plays, so the poster shows while it loads, and stays after an error.
 */
function BackgroundVideo({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <video
      // A muted video can start without a click. React sets `muted` only as a property, after the element is made.
      ref={(element) => {
        if (!element) return;
        element.defaultMuted = true;
        element.muted = true;
      }}
      src={src}
      muted
      autoPlay
      loop
      playsInline
      disablePictureInPicture
      disableRemotePlayback
      preload="auto"
      aria-hidden
      onPlaying={() => setPlaying(true)}
      className={cn(
        "absolute inset-0 size-full object-cover transition-opacity duration-500",
        playing ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

/** The text of the slide in the look, on the whole parent. No text in the modes "black" and "clear". */
export function SlideText({
  slide,
  look,
  mode = "show",
}: {
  slide: ProjectionSlide;
  look: ProjectionLook;
  mode?: ProjectionMode;
}) {
  const root = useRef<HTMLDivElement>(null);
  if (slide.kind === "image") return mode === "show" ? <SlideImage slide={slide} /> : null;
  if (slide.kind === "qr") return mode === "show" ? <QrSlide slide={slide} /> : null;
  const layout = slideLayout(look);
  const align = VERTICAL_ALIGN_CLASSES[look.verticalAlign];
  const family = fontFamily(look.font);
  const smallTextClass = "shrink-0 pt-[2cqh] text-[2.8cqh] leading-tight opacity-75";

  return (
    // The container is the parent of the padding: `cqh` is a part of the nearest
    // container above the element, never of the element itself. Without it,
    // the padding is a part of the viewport, too large on a small preview.
    <div ref={root} className="absolute inset-0 [container-type:size]">
      <div
        className="size-full"
        style={{
          padding: `${layout.padding * 100}cqh`,
          color: look.textColor,
          fontFamily: family,
          textAlign: look.textAlign,
          textShadow: textShadowCss(look.textShadow),
        }}
      >
        {mode === "show" && slide.kind === "title" && (
          <div className="flex size-full flex-col">
            <div className="min-h-0 flex-1">
              <FittedText
                slide={root}
                layout={layout}
                font={family}
                alignClass={align}
                lines={[[slide.title]]}
                className="font-bold"
              />
            </div>
            {slide.copyright && (
              <p className={cn(smallTextClass, "whitespace-pre-line")}>{slide.copyright}</p>
            )}
          </div>
        )}
        {mode === "show" && slide.kind === "lyrics" && (
          <FittedText
            slide={root}
            layout={layout}
            font={family}
            alignClass={align}
            lines={slide.paragraphs}
          />
        )}
        {mode === "show" && slide.kind === "text" && (
          <FittedText
            slide={root}
            layout={layout}
            font={family}
            alignClass={align}
            fitKey={JSON.stringify([slide.paragraphs, slide.highlight])}
          >
            <Paragraphs paragraphs={slide.paragraphs} layout={layout} />
            {slide.highlight.length > 0 && (
              <div
                className="font-bold"
                style={{
                  fontSize: `${HIGHLIGHT_SCALE}em`,
                  ...(slide.paragraphs.length > 0 && {
                    marginTop: `${layout.paragraphGap / HIGHLIGHT_SCALE}em`,
                  }),
                  ...(look.accentColor && { color: look.accentColor }),
                }}
              >
                <Paragraphs paragraphs={slide.highlight} layout={layout} />
              </div>
            )}
          </FittedText>
        )}
        {mode === "show" && slide.kind === "scripture" && (
          <div className="flex size-full flex-col">
            <div className="min-h-0 flex-1">
              {/* Prose: a centered paragraph is hard to read, so "center" is left here, also in the roll. */}
              {slide.roll && slide.roll.ids.length === slide.verses.length ? (
                <ScriptureRoll
                  slide={root}
                  verses={slide.verses}
                  roll={slide.roll}
                  look={look}
                  layout={layout}
                  font={family}
                />
              ) : (
                <FittedText
                  slide={root}
                  layout={layout}
                  font={family}
                  alignClass={align}
                  fitKey={JSON.stringify(slide.verses)}
                  className={cn("text-pretty", look.textAlign === "center" && "text-left")}
                >
                  <p>
                    {slide.verses.map((verse, index) => (
                      <span key={index}>
                        {index > 0 && " "}
                        <sup className="mr-[0.2em] text-[0.55em] font-semibold opacity-60">
                          {verse.label}
                        </sup>
                        {verse.text}
                      </span>
                    ))}
                  </p>
                </FittedText>
              )}
            </div>
            {/* A long reference at a large size wraps: the verses above it get smaller, as in the PPTX export. */}
            <p
              className={cn(smallTextClass, "text-balance break-words")}
              style={{ fontSize: `${layout.referenceFont * 100}cqh` }}
            >
              {slide.reference}
            </p>
          </div>
        )}
        {mode === "show" && slide.kind === "announcements" && (
          <div className="flex size-full flex-col">
            <div className="shrink-0 pb-[2cqh]">
              <p className="truncate text-[7cqh] leading-tight font-bold">{slide.heading}</p>
              <p className="truncate text-[2.8cqh] leading-tight opacity-75">{slide.range}</p>
            </div>
            <div className="min-h-0 flex-1">
              {/* A list: centered lines are hard to read, so "center" is left here, as for the verses. */}
              <FittedText
                slide={root}
                layout={layout}
                font={family}
                alignClass={align}
                fitKey={JSON.stringify(slide.entries)}
                className={cn(look.textAlign === "center" && "text-left")}
              >
                {slide.entries.map((entry, index) => (
                  <div
                    key={index}
                    className={cn(entry.accent && "font-bold")}
                    style={{
                      ...(index > 0 && { marginTop: `${layout.paragraphGap}em` }),
                      ...(entry.accent && look.accentColor && { color: look.accentColor }),
                    }}
                  >
                    <p>
                      {entry.accent && !look.accentColor && (
                        <span aria-hidden="true">{ACCENT_MARKER}</span>
                      )}
                      {entry.when && (
                        <span className="font-normal opacity-75">{entry.when} · </span>
                      )}
                      {entry.title}
                    </p>
                    {entry.details.map((detail, detailIndex) => (
                      <p
                        key={detailIndex}
                        className="text-[0.75em] font-normal whitespace-pre-line opacity-80"
                      >
                        {detail}
                      </p>
                    ))}
                  </div>
                ))}
              </FittedText>
            </div>
          </div>
        )}
        {mode === "show" && slide.kind === "announcement" && (
          <FittedText
            slide={root}
            layout={layout}
            font={family}
            alignClass={align}
            fitKey={JSON.stringify([slide.title, slide.when, slide.details])}
          >
            <p className="font-bold">{slide.title}</p>
            {slide.when && <p className="mt-[0.3em] text-[0.6em] opacity-80">{slide.when}</p>}
            {slide.details.map((detail, index) => (
              <p key={index} className="mt-[0.4em] text-[0.5em] whitespace-pre-line opacity-80">
                {detail}
              </p>
            ))}
          </FittedText>
        )}
      </div>
    </div>
  );
}

/** A QR code with its caption on a white card: black on white, so phones read it also on a dark screen. */
function QrCard({ text, caption, size }: { text: string; caption: string | null; size: string }) {
  return (
    <div className="flex max-h-full max-w-full flex-col items-center gap-[2cqh] rounded-[2cqh] bg-white p-[2.5cqh] text-black">
      <QrCode
        text={text}
        label={caption ?? text}
        className="aspect-square shrink-0"
        style={{ width: size }}
      />
      {caption && (
        <p className="max-w-full text-center text-[4cqh] leading-tight font-semibold text-balance">
          {caption}
        </p>
      )}
    </div>
  );
}

/** A QR code on the whole slide. */
function QrSlide({ slide }: { slide: Extract<ProjectionSlide, { kind: "qr" }> }) {
  return (
    // The padding is in the container, as in `SlideText`.
    <div className="absolute inset-0 [container-type:size]">
      <div className="flex size-full items-center justify-center p-[6cqh]">
        <QrCard
          text={slide.text}
          caption={slide.caption}
          size={slide.caption ? "min(70cqh, 80cqw)" : "min(80cqh, 80cqw)"}
        />
      </div>
    </div>
  );
}

/** An image of the gallery with its adjustments, on the whole parent. Hidden until the parent has a size. */
function SlideImage({ slide }: { slide: Extract<ProjectionSlide, { kind: "image" }> }) {
  const root = useRef<HTMLDivElement>(null);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    function measure() {
      if (element && element.clientWidth > 0 && element.clientHeight > 0)
        setAspectRatio(element.clientWidth / element.clientHeight);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { adjust, url, width, height, qr } = slide;
  const portrait = aspectRatio !== null && aspectRatio < 1;
  // With a QR code, the image has 2/3 of the width (of the height on a portrait screen).
  const imageAspectRatio =
    aspectRatio && qr ? (portrait ? aspectRatio * 1.5 : (aspectRatio * 2) / 3) : aspectRatio;
  const box = imageAspectRatio ? imageBox(adjust, width, height, imageAspectRatio) : null;
  // The blurred image covers the screen, a little larger: a blur makes its edges soft.
  const cover = aspectRatio
    ? imageBox({ ...adjust, fit: "cover", scale: 110, x: 0, y: 0 }, width, height, aspectRatio)
    : null;
  return (
    <div
      ref={root}
      className="absolute inset-0 overflow-hidden [container-type:size]"
      style={{
        backgroundColor: adjust.background === "color" ? adjust.backgroundColor : undefined,
      }}
    >
      {adjust.background === "blur" && cover && (
        <PlacedImage
          url={url}
          box={cover}
          style={{ filter: `blur(${BACKGROUND_BLUR * 100}cqh) brightness(0.8)` }}
        />
      )}
      {qr ? (
        <div
          className={cn(
            "absolute inset-0 flex",
            portrait ? "flex-col" : "flex-row",
            qr.side === "start" && (portrait ? "flex-col-reverse" : "flex-row-reverse"),
          )}
        >
          <div
            className={cn("relative overflow-hidden", portrait ? "h-2/3 w-full" : "h-full w-2/3")}
          >
            {box && <PlacedImage url={url} box={box} />}
          </div>
          <div
            className={cn(
              "flex items-center justify-center p-[3cqh]",
              portrait ? "h-1/3 w-full" : "h-full w-1/3",
            )}
          >
            <QrCard
              text={qr.text}
              caption={qr.caption}
              size={portrait ? "min(20cqh, 60cqw)" : "min(24cqw, 55cqh)"}
            />
          </div>
        </div>
      ) : (
        box && <PlacedImage url={url} box={box} />
      )}
    </div>
  );
}

/** The image at the place of `box` in its parent. */
function PlacedImage({
  url,
  box,
  style,
}: {
  url: string;
  box: ImageBox;
  style?: React.CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a private file: the image optimizer cannot read it.
    <img
      src={url}
      alt=""
      draggable={false}
      className="absolute max-w-none"
      style={{
        left: `${box.centerX * 100}%`,
        top: `${box.centerY * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
        transform: `translate(-50%, -50%) rotate(${box.rotation}deg)`,
        ...style,
      }}
    />
  );
}

/**
 * The paragraphs (or the children) as large as fits in the parent: at most
 * `layout.maxFont` of the height. When a text does not fit at `minFont`, the
 * controller has split it (see `splitSection` and `splitVerses`); it gets
 * smaller still, so nothing is cut off.
 */
function FittedText({
  slide,
  layout,
  font,
  alignClass,
  lines = [],
  fitKey,
  className,
  children,
}: {
  /** The slide: the text sizes are parts of its height. */
  slide: React.RefObject<HTMLDivElement | null>;
  layout: SlideLayout;
  /** The font of the parent (`font-family`). */
  font: string;
  /** The vertical alignment of the text in the parent. */
  alignClass: string;
  lines?: string[][];
  /** With `children`: changes when their text changes, so the text fits again. */
  fitKey?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [fontPx, setFontPx] = useState<number | null>(null);
  const text = fitKey ?? JSON.stringify(lines);
  const { minFont, maxFont } = layout;

  useLayoutEffect(() => {
    const boxElement = box.current;
    const contentElement = content.current;
    if (!boxElement || !contentElement) return;

    function fit() {
      const slideHeight = slide.current?.clientHeight ?? 0;
      if (!boxElement || !contentElement || slideHeight <= 0) return;
      const fitsAt = (px: number) => {
        contentElement.style.fontSize = `${px}px`;
        return (
          contentElement.scrollHeight <= boxElement.clientHeight &&
          contentElement.scrollWidth <= boxElement.clientWidth
        );
      };
      // Between a very small text and the largest one.
      const px = largestFit(slideHeight * minFont * 0.25, slideHeight * maxFont, fitsAt);
      contentElement.style.fontSize = `${px}px`;
      setFontPx(px);
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(boxElement);
    // The font can load after the first fit, and it has other widths.
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
    // A new font changes the width of the text, but not the box.
  }, [slide, text, font, minFont, maxFont]);

  return (
    <div ref={box} className={cn("flex size-full justify-center", alignClass)}>
      <div
        ref={content}
        // Hidden until the first fit, so the text does not jump.
        className={cn("w-full text-balance", fontPx === null && "invisible", className)}
        style={{ lineHeight: layout.lineHeight }}
      >
        {children ?? <Paragraphs paragraphs={lines} layout={layout} />}
      </div>
    </div>
  );
}

/** The paragraphs of a text, each a list of lines, with the gap of the layout between them. */
function Paragraphs({ paragraphs, layout }: { paragraphs: string[][]; layout: SlideLayout }) {
  return paragraphs.map((paragraph, index) => (
    <div key={index} style={index > 0 ? { marginTop: `${layout.paragraphGap}em` } : undefined}>
      {paragraph.map((line, lineIndex) => (
        <p key={lineIndex}>{line}</p>
      ))}
    </div>
  ));
}
