import { sameKey } from "./chords/key";
import type { SheetContentChoice } from "./sheet-view";

// What the sheet shows of a song: the chords, a MusicXML score, a PDF file or
// an image. The user chooses it for each song and type of device (the
// `content` of `sheet-view.ts`). A song without a choice shows the score of
// the device's score name, else the chords. A song without chords shows its
// first PDF file or image, else its first score, so a song with only a PDF
// shows the PDF.

type Score = { id: string; name: string };
type File = { id: string; keys: string[] };
type Image = File & { pages: readonly unknown[] };

export type SheetContent<S extends Score, P extends File, I extends Image> =
  | { kind: "chords" }
  | { kind: "score"; score: S }
  | { kind: "pdf"; pdf: P }
  | { kind: "image"; image: I };

/**
 * What the sheet shows of the song. `choice`: the user's own, or undefined.
 * A choice of a file that the song does not have anymore counts as no choice.
 * `scoreName`: the device's score name (see `sheet-settings.ts`). `hasChords`:
 * the chart has something to show. `shownKey`: the key of the sheet, in
 * English note names; a file in this key comes first.
 */
export function sheetContent<S extends Score, P extends File, I extends Image>({
  choice,
  scoreName,
  hasChords,
  scores,
  pdfs,
  images,
  shownKey,
}: {
  choice: SheetContentChoice | undefined;
  scoreName: string | null;
  hasChords: boolean;
  scores: S[];
  pdfs: P[];
  images: I[];
  shownKey: string | null;
}): SheetContent<S, P, I> {
  // An image without pages has nothing to show.
  const shownImages = images.filter((image) => image.pages.length > 0);

  if (choice?.kind === "chords") return { kind: "chords" };
  if (choice?.kind === "score") {
    const score = scores.find(({ id }) => id === choice.id);
    if (score) return { kind: "score", score };
  }
  if (choice?.kind === "pdf") {
    const pdf = pdfs.find(({ id }) => id === choice.id);
    if (pdf) return { kind: "pdf", pdf };
  }
  if (choice?.kind === "image") {
    const image = shownImages.find(({ id }) => id === choice.id);
    if (image) return { kind: "image", image };
  }

  const score = findScore(scores, scoreName);
  if (score) return { kind: "score", score };
  if (hasChords) return { kind: "chords" };

  // The files in the shown key, then the files for any key, then the others. PDFs before images.
  const files: SheetContent<S, P, I>[] = [
    ...pdfs.map((pdf) => ({ kind: "pdf" as const, pdf })),
    ...shownImages.map((image) => ({ kind: "image" as const, image })),
  ];
  const rank = (content: SheetContent<S, P, I>) => {
    const file =
      content.kind === "pdf"
        ? content.pdf
        : content.kind === "image"
          ? content.image
          : { keys: [] };
    if (isInKey(file, shownKey)) return 0;
    return file.keys.length === 0 ? 1 : 2;
  };
  const file = files.toSorted((a, b) => rank(a) - rank(b))[0];
  if (file) return file;
  return scores[0] ? { kind: "score", score: scores[0] } : { kind: "chords" };
}

/** The score with this name, without case. Null: none, or no name. */
export function findScore<S extends Score>(scores: S[], name: string | null): S | null {
  if (name === null) return null;
  const wanted = name.toLowerCase();
  return scores.find((score) => score.name.toLowerCase() === wanted) ?? null;
}

/** True when the file is for this key: it names it. A file for any key names none. */
export function isInKey(file: Pick<File, "keys">, key: string | null): boolean {
  return key !== null && file.keys.some((fileKey) => sameKey(fileKey, key));
}
