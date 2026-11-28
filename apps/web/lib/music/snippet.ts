// The lyrics that match a search of the songs page (`snippets` of
// `filter_songs`). The search words are between the marks chr(2) and chr(3),
// and " / " joins the lines.

const START = "\u0002";
const STOP = "\u0003";

/** A part of a snippet. `match`: a search word, to highlight. */
export type SnippetPart = { text: string; match: boolean };

/**
 * The parts of the snippet, without the marks. A mark without its pair is
 * left out. The line separators at the start and at the end go.
 */
export function parseSnippet(text: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  const add = (value: string, match: boolean) => {
    const clean = value.replaceAll(START, "").replaceAll(STOP, "");
    if (!clean) return;
    const last = parts.at(-1);
    if (last && last.match === match) last.text += clean;
    else parts.push({ text: clean, match });
  };

  let index = 0;
  while (index < text.length) {
    const start = text.indexOf(START, index);
    if (start < 0) break;
    const stop = text.indexOf(STOP, start + 1);
    if (stop < 0) break;
    add(text.slice(index, start), false);
    add(text.slice(start + 1, stop), true);
    index = stop + 1;
  }
  add(text.slice(index), false);

  const first = parts[0];
  if (first && !first.match) first.text = first.text.replace(/^[\s/]+/, "");
  const last = parts.at(-1);
  if (last && !last.match) last.text = last.text.replace(/[\s/]+$/, "");
  return parts.filter((part) => part.text);
}
