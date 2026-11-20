import { budapestWallClock, slugify, toIsoDate } from "@churchy/hu";
import type { PageBlock, RichText } from "@churchy/contracts";
import { richTextPlain } from "@churchy/events";

/**
 * Pure helpers of the content admin (D-20, D-21): publishing state, the plain-text stand-in for
 * the rich text editor (D-19), slugs and date-time inputs in Europe/Budapest.
 */

// ---------------------------------------------------------------------------------------------
// Publishing state (D-20)
// ---------------------------------------------------------------------------------------------

/** What an editor sees: *scheduled* is `published` with a future `publishedAt`. */
export type PublishState = "draft" | "scheduled" | "published" | "expired";

export function publishState(
  item: { status: string; publishedAt: string | null; expiresAt?: string | null },
  now: Date,
): PublishState {
  if (item.status !== "published" || item.publishedAt === null) return "draft";
  if (Date.parse(item.publishedAt) > now.getTime()) return "scheduled";
  if (item.expiresAt != null && Date.parse(item.expiresAt) <= now.getTime()) return "expired";
  return "published";
}

// ---------------------------------------------------------------------------------------------
// Plain text <-> rich text (stand-in for the Tiptap editor)
// ---------------------------------------------------------------------------------------------

/** Paragraphs are separated by a blank line, single line breaks become hard breaks. */
export function docFromText(text: string): RichText {
  const paragraphs = text
    .replaceAll("\r\n", "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  return {
    type: "doc",
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: p
        .split("\n")
        .flatMap((line, i) => [
          ...(i > 0 ? [{ type: "hardBreak" }] : []),
          ...(line === "" ? [] : [{ type: "text", text: line }]),
        ]),
    })),
  };
}

/** The document inside an editor value (`{"type":"doc",…}`), or null for anything else. */
export function parseDocValue(value: string | null | undefined): RichText | null {
  const text = (value ?? "").trim();
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as { type?: unknown; content?: unknown } | null;
    if (parsed !== null && typeof parsed === "object" && parsed.type === "doc") {
      const content = Array.isArray(parsed.content) ? (parsed.content as RichText["content"]) : [];
      return { type: "doc", content };
    }
  } catch {
    // Not JSON: plain text from a form posted without the editor.
  }
  return null;
}

/** Whether a document has neither text nor an image / embed. */
export function isEmptyDoc(doc: RichText): boolean {
  const media = (nodes: unknown): boolean =>
    Array.isArray(nodes) &&
    nodes.some((n: { type?: string; content?: unknown }) =>
      n.type === "image" || n.type === "embed" ? true : media(n.content),
    );
  return richTextPlain(doc).trim() === "" && !media(doc.content);
}

/** The editor's value for a stored document (JSON), `""` for none. */
export function docValue(doc: RichText | null | undefined): string {
  return doc && !isEmptyDoc(doc) ? JSON.stringify(doc) : "";
}

/** Form value of a submitted editor: an empty document counts as empty text. */
export function normalizeBodyValue(value: string): string {
  const doc = parseDocValue(value);
  return doc ? docValue(doc) : value;
}

export function textFromDoc(doc: RichText | null | undefined): string {
  return doc ? richTextPlain(doc) : "";
}

/**
 * The document to store for edited text: the original when the text did not change (so headings,
 * lists and marks survive a save that only touched other fields), a new document otherwise.
 * An empty text is `null`.
 */
export function bodyFromText(original: RichText | null | undefined, text: string): RichText | null {
  if (text.trim() === "") return null;
  const posted = parseDocValue(text);
  if (posted) return isEmptyDoc(posted) ? null : posted;
  if (original && textFromDoc(original) === text.replaceAll("\r\n", "\n").trim()) return original;
  return docFromText(text);
}

/**
 * Page blocks as text: `## ` / `### ` lines are headings, other paragraphs text. Other blocks
 * (image, gallery, quote, embed, call to action, file) are not representable and stay as they are.
 */
export function textFromBlocks(blocks: readonly PageBlock[]): string {
  return blocks
    .flatMap((b) =>
      b.type === "heading"
        ? [`${b.level === 2 ? "##" : "###"} ${b.text}`]
        : b.type === "text"
          ? [textFromDoc(b.content)]
          : [],
    )
    .filter((s) => s !== "")
    .join("\n\n");
}

/** Headings and text blocks of a page as one document (the editor's value). */
export function docFromBlocks(blocks: readonly PageBlock[]): RichText {
  return {
    type: "doc",
    content: blocks.flatMap((b) =>
      b.type === "heading"
        ? [
            {
              type: "heading",
              attrs: { level: Math.min(4, Math.max(2, b.level)) },
              content: [{ type: "text", text: b.text }],
            },
          ]
        : b.type === "text"
          ? b.content.content
          : [],
    ),
  };
}

export function hasOtherBlocks(blocks: readonly PageBlock[]): boolean {
  return blocks.some((b) => b.type !== "heading" && b.type !== "text");
}

/** Inverse of `textFromBlocks`; unchanged text keeps the original blocks, other blocks stay last. */
export function blocksFromText(original: readonly PageBlock[], text: string): PageBlock[] {
  const posted = parseDocValue(text);
  if (posted) {
    return [
      ...(isEmptyDoc(posted) ? [] : [{ type: "text" as const, content: posted }]),
      ...original.filter((b) => b.type !== "heading" && b.type !== "text"),
    ];
  }
  const normalized = text.replaceAll("\r\n", "\n").trim();
  if (textFromBlocks(original) === normalized) return [...original];
  const blocks: PageBlock[] = [];
  let paragraphs: string[] = [];
  const flush = () => {
    if (paragraphs.length > 0) {
      blocks.push({ type: "text", content: docFromText(paragraphs.join("\n\n")) });
      paragraphs = [];
    }
  };
  for (const part of normalized.split(/\n{2,}/)) {
    const heading = /^(#{2,3}) (.+)$/s.exec(part.trim());
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      flush();
      blocks.push({
        type: "heading",
        text: heading[2].trim().slice(0, 500),
        level: heading[1].length === 2 ? 2 : 3,
      });
    } else if (part.trim() !== "") {
      paragraphs.push(part.trim());
    }
  }
  flush();
  return [...blocks, ...original.filter((b) => b.type !== "heading" && b.type !== "text")];
}

// ---------------------------------------------------------------------------------------------
// Slugs (*Webcím*)
// ---------------------------------------------------------------------------------------------

/**
 * A slug that is not in `taken`: `base`, then `base-2`, `base-3` …. `fallback` is used when the
 * base has no letters or digits.
 */
export function uniqueSlug(base: string, taken: Iterable<string>, fallback = "tartalom"): string {
  const used = new Set(taken);
  const stem = slugify(base).slice(0, 100) || fallback;
  if (!used.has(stem)) return stem;
  for (let n = 2; ; n += 1) {
    const candidate = `${stem}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

// ---------------------------------------------------------------------------------------------
// `<input type="datetime-local">` in Europe/Budapest
// ---------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** `2026-11-22T18:30` (Budapest wall clock) for an instant; empty for null. */
export function localInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const w = budapestWallClock(new Date(iso));
  return `${toIsoDate(w)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** The instant (ISO, UTC) of a Budapest wall-clock input value, or null when empty or invalid. */
export function instantFromLocalInput(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value?.trim() ?? "");
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Correct the wall time (read as UTC) by the Budapest offset found at the guess; twice for DST.
  let guess = wall;
  for (let i = 0; i < 2; i += 1) {
    const w = budapestWallClock(new Date(guess));
    guess += wall - Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  }
  const instant = new Date(guess);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}
