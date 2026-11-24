import type { ChordProDocument, ChordProPart } from "./chordpro";

// The parts of a chart in playing order. The chord sheet and the projection
// use the same order, so a section name (see `sectionAnchors`) means the same
// place in both.

/** A part of the sheet in playing order. */
export type SheetBlock = ChordProPart & {
  key: string;
  /** The index of the part in the chart. */
  part: number;
  /** The song played this section before. */
  repeat: boolean;
};

/**
 * The parts in the arrangement's section order, or as written. In the
 * section order, the lines outside the sections go with the section before
 * them; the ones before the first section come first. Sections that the
 * order does not name are left out.
 */
export function sheetBlocks(
  document: ChordProDocument,
  sectionOrder: string[],
  order: "arrangement" | "written",
): SheetBlock[] {
  if (order === "written" || sectionOrder.length === 0) {
    return document.parts.map((part, index) => ({
      ...part,
      key: String(index),
      part: index,
      repeat: false,
    }));
  }

  type IndexedPart = ChordProPart & { part: number };
  const leading: IndexedPart[] = [];
  const groups = new Map<string, IndexedPart[]>();
  let group = leading;
  for (const [index, chartPart] of document.parts.entries()) {
    const part = { ...chartPart, part: index };
    if (part.section) {
      group = [part];
      // The first section with a label wins, as in `normalizeContent`.
      const label = part.section.label.toLowerCase();
      if (!groups.has(label)) groups.set(label, group);
    } else {
      group.push(part);
    }
  }

  const blocks: SheetBlock[] = leading.map((part, index) => ({
    ...part,
    key: `lead-${index}`,
    repeat: false,
  }));
  const played = new Set<string>();
  sectionOrder.forEach((entry, position) => {
    const label = entry.toLowerCase();
    const parts = groups.get(label);
    if (!parts) return;
    const repeat = played.has(label);
    played.add(label);
    parts.forEach((part, index) => blocks.push({ ...part, key: `${position}-${index}`, repeat }));
  });
  return blocks;
}
