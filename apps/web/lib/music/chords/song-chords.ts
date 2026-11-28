import type { ChordProLine, ChordProPart } from "@/lib/music/chordpro";

/**
 * The chords of the parts, each once, in the order the song first plays them.
 * Remarks such as `[*Riff]` and the lines of tabs and grids are left out.
 */
export function songChords(parts: ChordProPart[]): string[] {
  const chords = new Set<string>();
  function read(lines: ChordProLine[]) {
    for (const line of lines) {
      if (line.kind === "lyrics") {
        for (const segment of line.segments) {
          if (segment.chord && !segment.annotation) chords.add(segment.chord);
        }
      } else if (line.kind === "chorus" && line.lines) {
        read(line.lines);
      }
    }
  }
  parts.forEach((part) => read(part.lines));
  return [...chords];
}
