import { z } from "zod";

// A user's own marks on a chord sheet: pen and highlighter strokes, and
// texts. The sheet flows again when the text size, the number of pages or the
// key changes, so a mark has no place on a page. It is anchored to a line of
// the chart (or to the header), and its points are in `em` from the top left
// corner of that line. The marks then move and grow with the line.
//
// The marks belong to the user and the arrangement: they show in every sheet
// that plays the arrangement. The server stores them (see
// `src/server/models/sheet-marks.ts`); keep the limits in sync with the
// migration.

export const MARK_KINDS = ["pen", "highlighter", "text"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

/** The names of the colors. The CSS variables `--mark-<color>` give them, for each paper and theme. */
export const MARK_COLORS = [
  "ink",
  "red",
  "blue",
  "green",
  "orange",
  "purple",
  "yellow",
  "pink",
] as const;
export type MarkColor = (typeof MARK_COLORS)[number];

/** The colors that each tool offers. */
export const PEN_COLORS = [
  "ink",
  "red",
  "blue",
  "green",
  "orange",
  "purple",
] as const satisfies MarkColor[];
export const HIGHLIGHTER_COLORS = [
  "yellow",
  "green",
  "pink",
  "blue",
] as const satisfies MarkColor[];

/** Line widths in `em`. */
export const PEN_WIDTHS = { thin: 0.07, thick: 0.15 } as const;
export const HIGHLIGHTER_WIDTH = 0.9;
/** Text sizes in `em` of the sheet text. */
export const TEXT_SIZES = { small: 0.7, medium: 0.9, large: 1.3 } as const;

export const MARK_TEXT_MAX = 500;
export const MARK_POINTS_MAX = 2000;
/** The marks of one user on one arrangement. */
export const MARKS_PER_ARRANGEMENT_MAX = 1000;

/** The anchor of the song's header (title, artist and details). */
export const HEADER_ANCHOR = "h";

/**
 * The anchor of a line: the index of the part in the chart, the index of the
 * line in the part, and the number of times the part showed before on the
 * sheet (a section that the song plays twice shows twice).
 */
export function lineAnchor(part: number, line: number, occurrence: number) {
  return `${part}.${line}.${occurrence}`;
}

const anchorSchema = z.string().regex(/^(h|\d{1,4}\.\d{1,4}\.\d{1,2})$/);
// Far enough for a mark next to its line, small enough to stay near it.
const coordinateSchema = z.number().min(-100).max(100);

const strokeSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["pen", "highlighter"]),
  anchor: anchorSchema,
  color: z.enum(MARK_COLORS),
  width: z.number().min(0.02).max(2),
  /** x and y of each point, one after the other. */
  points: z
    .array(coordinateSchema)
    .min(2)
    .max(MARK_POINTS_MAX * 2)
    .refine((points) => points.length % 2 === 0),
});

const textSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal("text"),
  anchor: anchorSchema,
  color: z.enum(MARK_COLORS),
  /** The top left corner of the text. */
  x: coordinateSchema,
  y: coordinateSchema,
  size: z.number().min(0.4).max(4),
  text: z.string().trim().min(1).max(MARK_TEXT_MAX),
});

export const sheetMarkSchema = z.discriminatedUnion("kind", [strokeSchema, textSchema]);

export type SheetMark = z.output<typeof sheetMarkSchema>;
export type StrokeMark = Extract<SheetMark, { kind: "pen" | "highlighter" }>;
export type TextMark = Extract<SheetMark, { kind: "text" }>;

/**
 * A new random id (UUID version 4). `crypto.randomUUID()` works only on HTTPS
 * and localhost, and a tablet on the local network may open the app over HTTP.
 */
export function newMarkId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Rounds to 1/100 em: smaller steps do not show, and they make the stored marks larger. */
export function roundEm(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Removes the points that do not change the shape of the stroke by more than
 * `tolerance` (Ramer–Douglas–Peucker). Keeps the first and the last point.
 */
export function simplifyStroke(points: number[], tolerance: number): number[] {
  const count = points.length / 2;
  if (count <= 2) return points.slice();
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack: [number, number][] = [[0, count - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = tolerance;
    for (let index = first + 1; index < last; index++) {
      const distance = distanceToSegment(
        points[index * 2]!,
        points[index * 2 + 1]!,
        points[first * 2]!,
        points[first * 2 + 1]!,
        points[last * 2]!,
        points[last * 2 + 1]!,
      );
      if (distance > farthestDistance) {
        farthest = index;
        farthestDistance = distance;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  const result: number[] = [];
  keep.forEach((kept, index) => {
    if (kept) result.push(points[index * 2]!, points[index * 2 + 1]!);
  });
  return result;
}

/**
 * The SVG path of a stroke: smooth curves through the middle points of the
 * segments. A single point is a dot (with round line caps).
 */
export function strokePath(points: number[]): string {
  const count = points.length / 2;
  if (count === 0) return "";
  const x = (index: number) => points[index * 2];
  const y = (index: number) => points[index * 2 + 1];
  if (count === 1) return `M${x(0)} ${y(0)}l0 0`;
  if (count === 2) return `M${x(0)} ${y(0)}L${x(1)} ${y(1)}`;

  let path = `M${x(0)} ${y(0)}`;
  for (let index = 1; index < count - 1; index++) {
    const midX = roundPath((x(index)! + x(index + 1)!) / 2);
    const midY = roundPath((y(index)! + y(index + 1)!) / 2);
    path += `Q${x(index)} ${y(index)} ${midX} ${midY}`;
  }
  return `${path}L${x(count - 1)} ${y(count - 1)}`;
}

function roundPath(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** The shortest distance from a point to the line of a stroke. */
export function distanceToStroke(px: number, py: number, points: number[]): number {
  const count = points.length / 2;
  if (count === 1) return Math.hypot(px - points[0]!, py - points[1]!);
  let nearest = Infinity;
  for (let index = 0; index < count - 1; index++) {
    nearest = Math.min(
      nearest,
      distanceToSegment(
        px,
        py,
        points[index * 2]!,
        points[index * 2 + 1]!,
        points[index * 2 + 2]!,
        points[index * 2 + 3]!,
      ),
    );
  }
  return nearest;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** The box around the points: left, top, right and bottom. */
export function strokeBounds(points: number[]): [number, number, number, number] {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let index = 0; index < points.length; index += 2) {
    left = Math.min(left, points[index]!);
    right = Math.max(right, points[index]!);
    top = Math.min(top, points[index + 1]!);
    bottom = Math.max(bottom, points[index + 1]!);
  }
  return [left, top, right, bottom];
}

/**
 * The changes of the user to the marks of one arrangement on this page, by
 * mark ID: the new mark, or null for a removed mark.
 */
export type MarkEdits = ReadonlyMap<string, SheetMark | null>;

/** The edits with one more change. A mark in `add` and `remove` changes (e.g. a moved text). */
export function addMarkEdits(
  edits: MarkEdits | undefined,
  change: { remove: SheetMark[]; add: SheetMark[] },
): MarkEdits {
  const result = new Map(edits);
  for (const mark of change.remove) result.set(mark.id, null);
  for (const mark of change.add) result.set(mark.id, mark);
  return result;
}

/**
 * The marks after new data from the server arrives (e.g. fresh data replaces
 * the browser copy), by arrangement. The edits of the user on this page go
 * again onto the new data: they are newer, and the server saves them. The
 * other marks come from the new data, also marks that the old data did not
 * have. Arrangements that are not in the new data drop out.
 */
export function mergeFreshMarks(
  fresh: Record<string, SheetMark[]>,
  edits: Readonly<Record<string, MarkEdits>>,
): Record<string, SheetMark[]> {
  return Object.fromEntries(
    Object.entries(fresh).map(([arrangementId, marks]) => {
      const changes = edits[arrangementId];
      if (!changes) return [arrangementId, marks];
      const result: SheetMark[] = [];
      for (const mark of marks) {
        const edit = changes.has(mark.id) ? changes.get(mark.id) : mark;
        if (edit) result.push(edit);
      }
      const known = new Set(marks.map((mark) => mark.id));
      for (const [id, mark] of changes) if (mark && !known.has(id)) result.push(mark);
      return [arrangementId, result];
    }),
  );
}
