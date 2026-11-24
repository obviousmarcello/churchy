// Converts a chart with plain section headers (`VERSE 1`, `[Chorus]`,
// `1. versszak`, `COLUMN_BREAK`), as chord websites and Word documents write
// them, to ChordPro sections. The song form runs it on paste, and the models
// run it on save.

import { parseChordProSections } from "./chordpro";

/** Section words in lower case, without spaces and hyphens, and their ChordPro environment. */
const SECTION_TYPES: Record<string, string> = {
  verse: "verse",
  versszak: "verse",
  strófa: "verse",
  chorus: "chorus",
  refrain: "chorus",
  refrén: "chorus",
  prechorus: "pre_chorus",
  előrefrén: "pre_chorus",
  bridge: "bridge",
  híd: "bridge",
  intro: "intro",
  előjáték: "intro",
  outro: "outro",
  ending: "outro",
  befejezés: "outro",
  zárás: "outro",
  utójáték: "outro",
  interlude: "interlude",
  instrumental: "interlude",
  közjáték: "interlude",
  átvezetés: "interlude",
  tag: "tag",
};

// The whole line: an optional bracket, an optional Hungarian ordinal ("2."),
// the section word (two words for "pre chorus"), an optional number or
// capital letter, an optional colon. Single letters are chords, not headers.
// Each `\s*` comes before a required character, so the time stays linear
// (adjacent `\s*` around optional parts backtrack on a line with many spaces).
const HEADER =
  /^[[(]?\s*(?:(\d+)\.?\s*)?(\p{L}+(?:[\s-]\p{L}{2,})?)(?:\s*(\d+|\p{Lu}))?(?:\s*:)?(?:\s*[\])])?(?:\s*:)?\s*$/u;
const BREAKS: [RegExp, string][] = [
  [/^column[\s_-]?break$/i, "{column_break}"],
  [/^(?:page[\s_-]?break|new[\s_-]?page)$/i, "{new_page}"],
];
// ChordPro breaks also close a plain section.
const BREAK_DIRECTIVE = /^\{\s*(?:new_page|np|new_physical_page|npp|column_break|colb)\s*\}$/i;
const SECTION_END = /^\{\s*(?:end_of_[a-z_]+|eo[vcbtg])\s*\}$/i;
const DIRECTIVE = /^\{[^}]*\}$/;
// Comments can be part of a section, e.g. `{comment: 2x}`.
const SECTION_COMMENT =
  /^\{\s*(?:comment|c|comment_italic|ci|comment_box|cb|highlight)\s*(?::|\})/i;

type Block =
  | { kind: "text"; lines: string[] }
  | { kind: "section"; type: string; label: string; lines: string[] }
  | { kind: "break"; directive: string }
  /** A `{start_of_…}` section of the text, as written. `body` has the lines between the directives. */
  | { kind: "chordpro"; type: string; label: string; lines: string[]; body: string[] };

/**
 * The chart with each header line as a `{start_of_…}` … `{end_of_…}` section
 * and each break line as a directive. Directives and `{start_of_…}` sections
 * stay as written, and header lines in those sections stay lyrics. `converted`
 * is false, and the text is unchanged, when the text has no headers or breaks.
 *
 * Labels stay distinct, so the playing order can name each section: a chorus
 * that is the same as the last one becomes `{chorus}`, and another section
 * with a label already in use gets a number ("Chorus 2").
 */
export function convertPlainSections(text: string): { chordpro: string; converted: boolean } {
  const blocks = readBlocks(text);
  if (blocks.every((block) => block.kind === "text" || block.kind === "chordpro")) {
    return { chordpro: text, converted: false };
  }

  // A plain section also takes a number for the label of a later ChordPro section.
  const used = new Set(
    blocks.flatMap((block) => (block.kind === "chordpro" ? [block.label.toLowerCase()] : [])),
  );
  const reserved = new Set([
    ...used,
    ...blocks.flatMap((block) => (block.kind === "section" ? [block.label.toLowerCase()] : [])),
  ]);
  let lastChorus = null as { label: string; body: string } | null;
  const out: string[] = [];

  for (const block of blocks) {
    if (block.kind === "text") {
      out.push(...block.lines);
      continue;
    }
    if (block.kind === "break") {
      out.push(block.directive);
      continue;
    }
    if (block.kind === "chordpro") {
      out.push(...block.lines);
      if (block.type === "chorus") {
        lastChorus = {
          label: block.label.toLowerCase(),
          body: splitBody(block.body).body.join("\n"),
        };
      }
      continue;
    }

    const { body, trailing } = splitBody(block.lines);
    const key = block.label.toLowerCase();
    const bodyText = body.join("\n");

    if (body.length === 0) {
      out.push(block.type === "chorus" ? `{chorus: ${block.label}}` : `{comment: ${block.label}}`);
    } else if (
      block.type === "chorus" &&
      lastChorus?.label === key &&
      lastChorus.body === bodyText
    ) {
      out.push(`{chorus: ${block.label}}`);
    } else {
      const label = used.has(key) ? numberedLabel(block.label, reserved) : block.label;
      used.add(label.toLowerCase());
      reserved.add(label.toLowerCase());
      if (block.type === "chorus") lastChorus = { label: key, body: bodyText };
      out.push(`{start_of_${block.type}: ${label}}`, ...body, `{end_of_${block.type}}`);
    }
    out.push(...trailing);
  }

  return { chordpro: out.join("\n"), converted: true };
}

function readBlocks(text: string): Block[] {
  let current: Block = { kind: "text", lines: [] };
  const blocks: Block[] = [current];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const chordproSection = trimmed.startsWith("{") ? parseChordProSections(trimmed)[0] : undefined;
    // As in `parseChordPro`, the next `{start_of_…}` also closes a section.
    if (current.kind === "chordpro" && !chordproSection) {
      current.lines.push(line);
      if (SECTION_END.test(trimmed)) {
        current = { kind: "text", lines: [] };
        blocks.push(current);
      } else {
        current.body.push(line);
      }
      continue;
    }

    if (chordproSection) {
      current = { kind: "chordpro", ...chordproSection, lines: [line], body: [] };
      blocks.push(current);
      continue;
    }
    if (BREAK_DIRECTIVE.test(trimmed) || (current.kind === "section" && closesSection(trimmed))) {
      current = { kind: "text", lines: [line] };
      blocks.push(current);
      continue;
    }

    const directive = BREAKS.find(([pattern]) => pattern.test(trimmed))?.[1];
    const header = directive ? null : parseHeader(trimmed);

    if (directive) {
      current = { kind: "text", lines: [] };
      blocks.push({ kind: "break", directive }, current);
    } else if (header) {
      current = { kind: "section", ...header, lines: [] };
      blocks.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return blocks;
}

/** Other directives, e.g. a `{chorus}` reprise or `{key: G}`, close a plain section. */
function closesSection(line: string) {
  return DIRECTIVE.test(line) && !SECTION_COMMENT.test(line);
}

function parseHeader(line: string): { type: string; label: string } | null {
  const match = HEADER.exec(line.normalize("NFC"));
  if (!match) return null;

  const type = SECTION_TYPES[match[2]!.toLowerCase().replace(/[\s-]/g, "")];
  if (!type) return null;

  const label = stripHeaderEnd(line.normalize("NFC").replace(/^[[(]\s*/, "")).replace(/\s+/g, " ");
  return { type, label: label === label.toLocaleUpperCase() ? sentenceCase(label) : label };
}

/** Removes the closing bracket and the colons of a header line, e.g. `Verse 1:]` → `Verse 1`. */
function stripHeaderEnd(text: string) {
  let rest = text.trimEnd();
  if (rest.endsWith(":")) rest = rest.slice(0, -1).trimEnd();
  if (rest.endsWith("]") || rest.endsWith(")")) rest = rest.slice(0, -1).trimEnd();
  if (rest.endsWith(":")) rest = rest.slice(0, -1).trimEnd();
  return rest;
}

/** Leading empty lines are dropped. Trailing ones go after the section. */
function splitBody(lines: string[]) {
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === "") end--;
  let start = 0;
  while (start < end && lines[start]!.trim() === "") start++;
  return { body: lines.slice(start, end), trailing: lines.slice(end) };
}

function numberedLabel(label: string, reserved: Set<string>) {
  for (let number = 2; ; number++) {
    const candidate = `${label} ${number}`;
    if (!reserved.has(candidate.toLowerCase())) return candidate;
  }
}

function sentenceCase(label: string) {
  const lower = label.toLocaleLowerCase();
  const first = lower.search(/\p{L}/u);
  return first < 0
    ? lower
    : lower.slice(0, first) + lower.charAt(first).toLocaleUpperCase() + lower.slice(first + 1);
}
