// Minimal ChordPro helpers shared by the server and the UI.
// See https://www.chordpro.org/chordpro/directives-env/ for the section syntax.

export type ChordProSection = {
  /** Environment name, e.g. "verse", "chorus", "bridge". */
  type: string;
  /** Label from the directive, or the type in title case. */
  label: string;
};

const SHORT_FORMS: Record<string, string> = {
  sov: "verse",
  soc: "chorus",
  sob: "bridge",
  sot: "tab",
  sog: "grid",
};

const DIRECTIVE_NAME = /^[a-z_]+/i;
const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;

/**
 * The name and the value of a directive line, or null for another line.
 * `{start_of_verse}`, `{start_of_verse: Verse 1}`, `{sov Verse 1}` and
 * `{start_of_verse label="Verse 1"}` are all valid. The value is trimmed, and
 * empty without one.
 *
 * A plain scan, not one regular expression: an expression with several `\s*`
 * around an optional separator takes exponential time on a line such as
 * `{a` followed by many spaces (a chart is user input).
 */
export function matchDirective(line: string): { name: string; value: string } | null {
  const trimmed = line.trim();
  if (trimmed.length < 2 || !trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;

  const inside = trimmed.slice(1, -1).trimStart();
  const name = DIRECTIVE_NAME.exec(inside)?.[0];
  if (!name) return null;

  const rest = inside.slice(name.length);
  const afterSpace = rest.trimStart();
  let value: string;
  if (afterSpace.startsWith(":")) value = afterSpace.slice(1).trim();
  else if (afterSpace !== rest || rest === "") value = afterSpace.trimEnd();
  else return null;

  return LINE_TERMINATOR.test(value) ? null : { name, value };
}
const LABEL_ATTRIBUTE = /label\s*=\s*"([^"]*)"/i;

/**
 * Lists the sections of a chart in document order. Give sections distinct
 * labels (Verse 1, Verse 2) so an arrangement's order can name each one.
 */
export function parseChordProSections(source: string): ChordProSection[] {
  const sections: ChordProSection[] = [];
  for (const line of source.split(/\r?\n/)) {
    const match = matchDirective(line);
    if (!match) continue;

    const type = sectionType(match.name);
    if (!type) continue;

    sections.push({ type, label: parseLabel(match.value) || titleCase(type) });
  }
  return sections;
}

/**
 * Sets the value of a metadata directive such as `{tempo: 72}`, or removes it
 * when `value` is null. Replaces the first occurrence, or adds the directive
 * at the end of the chart's header (the directives before the first lyric line
 * or section).
 */
export function setChordProDirective(source: string, name: string, value: string | null): string {
  if (!/^[a-z_]+$/.test(name)) throw new Error(`Invalid directive name: ${name}`);
  if (value !== null && /[{}\r\n]/.test(value))
    throw new Error("Directive values cannot contain braces or line breaks");

  const lines = source === "" ? [] : source.split(/\r?\n/);
  const pattern = new RegExp(`^\\s*\\{\\s*${name}\\s*:`);
  const index = lines.findIndex((line) => pattern.test(line));

  if (value === null) {
    if (index >= 0) lines.splice(index, 1);
  } else if (index >= 0) {
    lines[index] = `{${name}: ${value}}`;
  } else {
    let end = 0;
    while (end < lines.length && isHeaderDirective(lines[end]!)) end++;
    lines.splice(end, 0, `{${name}: ${value}}`);
  }
  return lines.join("\n");
}

function isHeaderDirective(line: string) {
  const match = matchDirective(line);
  return (
    match !== null &&
    sectionType(match.name) === null &&
    !match.name.toLowerCase().startsWith("end_of_")
  );
}

function sectionType(directive: string) {
  const name = directive.toLowerCase();
  return (
    SHORT_FORMS[name] ?? (name.startsWith("start_of_") ? name.slice("start_of_".length) : null)
  );
}

function parseLabel(argument: string) {
  if (!argument) return "";
  const attribute = LABEL_ATTRIBUTE.exec(argument);
  return (attribute ? attribute[1] : argument)!.trim();
}

function titleCase(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// A chart as the chord sheet shows it. See https://www.chordpro.org/chordpro/chordpro-introduction/.

/** A chord with the lyrics under it, up to the next chord. */
export type ChordProSegment = {
  /** Null for the lyrics before the first chord of a line. */
  chord: string | null;
  /** `[*Riff]`: a remark in the chord line, not a chord. */
  annotation: boolean;
  text: string;
};

export type ChordProLine =
  | { kind: "lyrics"; segments: ChordProSegment[] }
  | { kind: "comment"; text: string; style: "normal" | "italic" | "box" }
  /** A line of a tab or grid section, shown as written. */
  | { kind: "verbatim"; text: string }
  | { kind: "empty" }
  /** `{new_page}` or `{column_break}`: the next line starts a new page. */
  | { kind: "break" }
  /** `{chorus}`: play the last chorus again. `lines` is null if no chorus comes before it. */
  | { kind: "chorus"; label: string; lines: ChordProLine[] | null };

/** A section, or the lines outside the sections (`section` is null). */
export type ChordProPart = {
  section: ChordProSection | null;
  lines: ChordProLine[];
};

export type ChordProDocument = {
  /** The first value of each metadata directive, e.g. `{ title: "…", capo: "2" }`. */
  meta: Record<string, string>;
  /** In document order. */
  parts: ChordProPart[];
};

const END_SHORT_FORMS = new Set(["eov", "eoc", "eob", "eot", "eog"]);
const VERBATIM_SECTIONS = new Set(["tab", "grid"]);
const COMMENT_STYLES: Record<string, "normal" | "italic" | "box"> = {
  comment: "normal",
  c: "normal",
  highlight: "normal",
  comment_italic: "italic",
  ci: "italic",
  comment_box: "box",
  cb: "box",
};
const BREAKS = new Set(["new_page", "np", "new_physical_page", "npp", "column_break", "colb"]);
const META_SHORT_FORMS: Record<string, string> = { t: "title", st: "subtitle" };
const CHORD = /\[([^\]]*)\]/g;

/** Reads a chart into sections and lines. Ignores the directives it does not know. */
export function parseChordPro(source: string): ChordProDocument {
  const meta: Record<string, string> = {};
  const parts: ChordProPart[] = [];
  let current: ChordProPart = { section: null, lines: [] };
  let lastChorus: ChordProLine[] | null = null;

  function close(next: ChordProPart) {
    if (current.lines.length > 0) parts.push(current);
    if (current.section?.type === "chorus") lastChorus = current.lines;
    current = next;
  }

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.trimStart().startsWith("#")) continue;

    const match = matchDirective(line);
    if (match) {
      const name = match.name.toLowerCase();
      const argument = match.value;
      const type = sectionType(name);

      if (type) {
        close({ section: { type, label: parseLabel(argument) || titleCase(type) }, lines: [] });
      } else if (name.startsWith("end_of_") || END_SHORT_FORMS.has(name)) {
        close({ section: null, lines: [] });
      } else if (name in COMMENT_STYLES) {
        if (argument)
          current.lines.push({ kind: "comment", text: argument, style: COMMENT_STYLES[name]! });
      } else if (name === "chorus") {
        current.lines.push({
          kind: "chorus",
          label: parseLabel(argument) || "Chorus",
          lines: lastChorus,
        });
      } else if (BREAKS.has(name)) {
        current.lines.push({ kind: "break" });
      } else if (name === "meta") {
        const [key, ...value] = argument.split(/\s+/);
        if (key && value.length > 0) meta[key.toLowerCase()] ??= value.join(" ");
      } else if (argument) {
        meta[META_SHORT_FORMS[name] ?? name] ??= argument;
      }
      continue;
    }

    if (current.section && VERBATIM_SECTIONS.has(current.section.type)) {
      current.lines.push({ kind: "verbatim", text: line });
    } else if (line.trim() === "") {
      current.lines.push({ kind: "empty" });
    } else {
      current.lines.push({ kind: "lyrics", segments: parseSegments(line) });
    }
  }
  close({ section: null, lines: [] });

  return {
    meta,
    parts: parts.filter((part) => part.section || part.lines.some((line) => line.kind !== "empty")),
  };
}

function parseSegments(line: string): ChordProSegment[] {
  const segments: ChordProSegment[] = [];
  let index = 0;
  let chord: string | null = null;
  for (const match of line.matchAll(CHORD)) {
    const text = line.slice(index, match.index);
    if (chord !== null || text !== "") segments.push(toSegment(chord, text));
    chord = match[1]!.trim();
    index = match.index + match[0].length;
  }
  segments.push(toSegment(chord, line.slice(index)));
  return segments;
}

function toSegment(chord: string | null, text: string): ChordProSegment {
  const annotation = chord?.startsWith("*") ?? false;
  return { chord: annotation ? chord!.slice(1) : chord, annotation, text };
}
