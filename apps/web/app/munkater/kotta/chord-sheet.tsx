import { RepeatIcon } from "lucide-react";

import { useI18n } from "@/i18n/music/client";
import type { ChordProLine, ChordProSegment, ChordProSection } from "@/lib/music/chordpro";
import { sectionAnchors } from "@/lib/music/live/protocol";
import type { SheetBlock } from "@/lib/music/sheet-blocks";
import { HEADER_ANCHOR, lineAnchor } from "@/lib/music/sheet-marks";
import { firstSyllable } from "@/lib/music/syllable";
import { cn } from "@/lib/music/utils";
import type { SheetSettings } from "./sheet-settings";

export { sheetBlocks, type SheetBlock } from "@/lib/music/sheet-blocks";

// Renders a parsed ChordPro chart as a chord sheet: chords above the lyrics,
// section labels, choruses with a bar at the side. The parent lays the sheet
// out in columns (the pages), so the parts that must stay together avoid
// column breaks: the header, each paragraph, and a section label with the
// first paragraph of its section.
//
// Each line that shows is an anchor for the user's marks (`data-mark-anchor`,
// see `src/lib/sheet-marks.ts`): the marks of the line show in it, so they
// move with the line when the sheet flows again.

type DisplayOptions = Pick<SheetSettings, "showChords" | "underlineSyllables" | "repeats">;

export function ChordSheet({
  title,
  subtitle,
  details,
  blocks,
  options,
  marks,
}: {
  title: string;
  subtitle: string | null;
  /** For example ["Key G", "72 BPM"]. */
  details: string[];
  blocks: SheetBlock[];
  options: DisplayOptions;
  /** The user's marks of an anchor. Without it, the sheet has no anchors. */
  marks?: (anchor: string) => React.ReactNode;
}) {
  const { m } = useI18n();
  const content: React.ReactNode[] = [];
  // A name for each section, the same on all devices. A live session uses it to show the leader's place.
  const anchors = sectionAnchors(blocks.map((block) => block.section));
  // `{new_page}` at the end of a block moves the next block to a new page.
  let pendingBreak = false;
  // How many times each part showed before.
  const occurrences = new Map<number, number>();
  blocks.forEach((block, index) => {
    const anchor = anchors[index] ?? undefined;
    const occurrence = occurrences.get(block.part) ?? 0;
    occurrences.set(block.part, occurrence + 1);
    if (block.repeat && options.repeats === "label") {
      // Lines outside the sections go with the section before them, so they are a repeat too.
      if (block.section) {
        content.push(
          <RepeatLabel
            key={block.key}
            section={block.section}
            breakBefore={pendingBreak}
            anchor={anchor}
          />,
        );
        pendingBreak = false;
      }
      return;
    }

    const { paragraphs, breakAfter } = toParagraphs(block.lines, pendingBreak);
    content.push(
      <Block
        key={block.key}
        section={block.section}
        paragraphs={paragraphs}
        options={options}
        anchor={anchor}
        markAnchor={marks && ((line) => lineAnchor(block.part, line, occurrence))}
        marks={marks}
      />,
    );
    pendingBreak = breakAfter;
  });

  return (
    <>
      <header
        data-mark-anchor={marks ? HEADER_ANCHOR : undefined}
        className={cn("mb-[1.25em] break-inside-avoid", marks && "relative")}
      >
        <h2 className="text-[1.5em] leading-tight font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-(--sheet-muted)">{subtitle}</p>}
        {details.length > 0 && (
          <p className="mt-[0.25em] text-[0.8em] text-(--sheet-muted)">
            {details.join(m.common.separator)}
          </p>
        )}
        {marks?.(HEADER_ANCHOR)}
      </header>
      {content}
    </>
  );
}

/** `index`: the index of the line in its part. */
type Paragraph = { lines: { line: ChordProLine; index: number }[]; breakBefore: boolean };

// Empty lines separate paragraphs. A `{chorus}` line is a paragraph of its own.
function toParagraphs(lines: ChordProLine[], breakBefore: boolean) {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph["lines"] = [];
  let pendingBreak = breakBefore;

  function flush() {
    if (current.length === 0) return;
    paragraphs.push({ lines: current, breakBefore: pendingBreak });
    current = [];
    pendingBreak = false;
  }

  for (const [index, line] of lines.entries()) {
    if (line.kind === "empty") {
      flush();
    } else if (line.kind === "break") {
      flush();
      pendingBreak = true;
    } else if (line.kind === "chorus") {
      flush();
      current.push({ line, index });
      flush();
    } else {
      current.push({ line, index });
    }
  }
  flush();
  return { paragraphs, breakAfter: pendingBreak };
}

function Block({
  section,
  paragraphs,
  options,
  anchor,
  markAnchor,
  marks,
}: {
  section: ChordProSection | null;
  paragraphs: Paragraph[];
  options: DisplayOptions;
  anchor?: string;
  /** The mark anchor of a line, by its index in the part. */
  markAnchor?: (line: number) => string;
  marks?: (anchor: string) => React.ReactNode;
}) {
  const heading = section && <SectionLabel section={section} />;

  return (
    <section
      data-live-anchor={anchor}
      className={cn(
        "mb-[1em]",
        section?.type === "chorus" && "border-l-[0.15em] border-(--sheet-rule) pl-[0.75em]",
      )}
    >
      {paragraphs.length === 0 && heading}
      {paragraphs.map((paragraph, index) => (
        <div
          key={index}
          className={cn(
            "break-inside-avoid not-last:mb-[0.75em]",
            paragraph.breakBefore && "break-before-column",
          )}
        >
          {index === 0 && heading}
          {paragraph.lines.map(({ line, index: lineIndex }) =>
            markAnchor && marks && lineShows(line, options) ? (
              <div key={lineIndex} data-mark-anchor={markAnchor(lineIndex)} className="relative">
                <Line line={line} options={options} />
                {marks(markAnchor(lineIndex))}
              </div>
            ) : (
              <Line key={lineIndex} line={line} options={options} />
            ),
          )}
        </div>
      ))}
    </section>
  );
}

function SectionLabel({ section, repeat }: { section: ChordProSection; repeat?: boolean }) {
  const { m } = useI18n();
  return (
    <h3 className="mb-[0.2em] flex items-center gap-[0.35em] text-[0.75em] font-semibold tracking-wide text-(--sheet-muted) uppercase">
      {section.label}
      {repeat && (
        <>
          <RepeatIcon aria-hidden className="size-[1em]" />
          <span className="sr-only">{m.sheet.chart.repeat}</span>
        </>
      )}
    </h3>
  );
}

function RepeatLabel({
  section,
  breakBefore,
  anchor,
}: {
  section: ChordProSection;
  breakBefore: boolean;
  anchor?: string;
}) {
  return (
    <div
      data-live-anchor={anchor}
      className={cn("mb-[1em] break-inside-avoid", breakBefore && "break-before-column")}
    >
      <SectionLabel section={section} repeat />
    </div>
  );
}

function Line({ line, options }: { line: ChordProLine; options: DisplayOptions }) {
  switch (line.kind) {
    case "lyrics":
      return (
        <LyricsLine
          segments={line.segments}
          showChords={options.showChords}
          underlineSyllables={options.underlineSyllables}
        />
      );
    case "comment":
      return (
        <p
          className={cn(
            "my-[0.2em] text-[0.85em] text-(--sheet-muted)",
            line.style === "italic" && "italic",
            line.style === "box" && "w-fit border border-(--sheet-rule) px-[0.4em]",
            line.style === "normal" && "font-semibold",
          )}
        >
          {line.text}
        </p>
      );
    case "verbatim":
      return (
        <pre className="overflow-x-auto overscroll-x-contain font-mono text-[0.85em] leading-snug whitespace-pre">
          {line.text || " "}
        </pre>
      );
    case "chorus": {
      const section = { type: "chorus", label: line.label };
      if (!line.lines || options.repeats === "label")
        return <SectionLabel section={section} repeat />;
      return (
        <div className="border-l-[0.15em] border-(--sheet-rule) pl-[0.75em]">
          <SectionLabel section={section} />
          {line.lines.map((reprise, index) =>
            reprise.kind === "empty" ? (
              <div key={index} className="h-[0.75em]" />
            ) : (
              <Line key={index} line={reprise} options={options} />
            ),
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

/** False for a line that `Line` does not show: it has no place for marks. */
function lineShows(line: ChordProLine, options: DisplayOptions) {
  switch (line.kind) {
    case "lyrics":
      return (
        line.segments.some((segment) => segment.text.trim() !== "") ||
        (options.showChords && line.segments.some((segment) => segment.chord))
      );
    case "comment":
    case "verbatim":
    case "chorus":
      return true;
    default:
      return false;
  }
}

function LyricsLine({
  segments,
  showChords,
  underlineSyllables,
}: {
  segments: ChordProSegment[];
  showChords: boolean;
  underlineSyllables: boolean;
}) {
  const text = segments.map((segment) => segment.text).join("");
  const hasChords = segments.some((segment) => segment.chord);

  if (!showChords || !hasChords) {
    // A line of chords only has nothing to show without the chords.
    if (text.trim() === "") return null;
    return <p className="leading-[1.35] whitespace-pre-wrap">{text}</p>;
  }

  // A line of chords only, e.g. an intro: the spaces of the chart set the distance between the chords.
  if (text.trim() === "") {
    return (
      <p className="leading-[1.2] font-bold whitespace-pre-wrap text-(--sheet-chord)">
        {segments.map((segment, index) => (
          <span key={index}>
            <Chord segment={segment} />
            {segment.text.length > 1 ? segment.text : " "}
          </span>
        ))}
      </p>
    );
  }

  return (
    <p className="leading-[1.35]">
      {segments.flatMap((segment, index) =>
        splitWords(segment).map((piece, pieceIndex) => (
          <span key={`${index}-${pieceIndex}`} className="inline-flex flex-col">
            <span className="pr-[0.35em] leading-[1.2] font-bold text-(--sheet-chord)">
              {piece.chord ? <Chord segment={piece} /> : "\u00a0"}
            </span>
            <span className="whitespace-pre">
              {underlineSyllables && piece.chord && !piece.annotation ? (
                <ChordSyllable text={piece.text} />
              ) : (
                piece.text
              )}
            </span>
          </span>
        )),
      )}
    </p>
  );
}

function Chord({ segment }: { segment: ChordProSegment }) {
  return <span className={cn(segment.annotation && "font-normal italic")}>{segment.chord}</span>;
}

/** The text under a chord, with a line under the syllable where the chord comes in. */
function ChordSyllable({ text }: { text: string }) {
  const syllable = firstSyllable(text);
  if (!syllable) return text;
  return (
    <>
      {text.slice(0, syllable.start)}
      <span className="underline decoration-(--sheet-chord) decoration-[length:0.08em] underline-offset-[0.15em]">
        {text.slice(syllable.start, syllable.end)}
      </span>
      {text.slice(syllable.end)}
    </>
  );
}

// The chord stays above the first word. The words after it are pieces of
// their own, so a long line can wrap between them.
function splitWords(segment: ChordProSegment): ChordProSegment[] {
  const words = segment.text.match(/^\s*\S*\s*|\S+\s*/g) ?? [""];
  return words.map((text, index) =>
    index === 0 ? { ...segment, text } : { chord: null, annotation: false, text },
  );
}
