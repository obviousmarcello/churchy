import "server-only";

import { getRequestI18n } from "@/i18n/music/server";
import { splitKeys } from "@/lib/music/chords/key";
import { isNotation, type Notation } from "@/lib/music/chords/notation";
import { fieldError, text } from "@/server/music/form-state";

/**
 * The song and the content of its arrangement from the song form (see
 * `SongForm`), or an error state for the fields that the model cannot
 * explain well. The errors are in the language of the request.
 */
export async function readSongInput(formData: FormData) {
  const title = text(formData, "title");
  if (!title.trim())
    return fieldError("title", (await getRequestI18n()).m.songs.input.titleRequired);

  const durationSeconds = parseDuration(text(formData, "duration"));
  if (durationSeconds === null) {
    return fieldError("durationSeconds", (await getRequestI18n()).m.songs.input.durationFormat);
  }

  const bpm = text(formData, "bpm");

  return {
    title,
    artist: text(formData, "artist"),
    // The model trims the tags and removes copies. A form without the tag
    // input keeps the tags: e.g. an older version, which sent no "tagsSent".
    tags:
      formData.has("tagsSent") || formData.has("tags")
        ? formData.getAll("tags").filter((entry) => typeof entry === "string")
        : undefined,
    // Form submissions send CRLF line breaks. Store the copyright and the chart with LF.
    // A form without the copyright field keeps the copyright.
    copyright: formData.has("copyright")
      ? text(formData, "copyright").replace(/\r\n?/g, "\n")
      : undefined,
    // A form without the songbook field keeps the songbook.
    songbook: formData.has("songbook") ? text(formData, "songbook") : undefined,
    // A form without the rights fields keeps the rights. Store the note with LF, as the copyright.
    authors: formData.has("authors") ? text(formData, "authors") : undefined,
    originalTitle: formData.has("originalTitle") ? text(formData, "originalTitle") : undefined,
    translator: formData.has("translator") ? text(formData, "translator") : undefined,
    rightsStatus: formData.has("rightsStatus") ? text(formData, "rightsStatus") : undefined,
    rightsNote: formData.has("rightsNote")
      ? text(formData, "rightsNote").replace(/\r\n?/g, "\n")
      : undefined,
    chordpro: text(formData, "chordpro").replace(/\r\n?/g, "\n"),
    // The user undid the conversion: plain section headers and chord lines stay as written.
    keepPlainSections: text(formData, "keepPlainSections") === "true",
    sectionOrder: formData.getAll("sectionOrder").filter((entry) => typeof entry === "string"),
    // An empty field keeps the value from the chart's directive.
    key: text(formData, "key") || undefined,
    otherKeys: text(formData, "otherKeys").trim()
      ? splitKeys(text(formData, "otherKeys"))
      : undefined,
    // "auto": from the chords of the chart.
    notation: readNotation(text(formData, "notation")),
    bpm: bpm ? Number(bpm) : undefined,
    timeSignature: text(formData, "timeSignature") || undefined,
    durationSeconds,
  };
}

/**
 * The projection theme of the arrangement from the song form: null for the
 * theme of the event, undefined for a form without the field (it keeps the theme).
 */
export function readArrangementThemeId(formData: FormData): string | null | undefined {
  if (!formData.has("themeId")) return undefined;
  return text(formData, "themeId") || null;
}

function readNotation(value: string): Notation | null | undefined {
  if (value === "auto") return null;
  return isNotation(value) ? value : undefined;
}

/** `4:05` or `245` (seconds). Empty gives undefined, an unknown format gives null. */
function parseDuration(value: string): number | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{1,5}$/.test(trimmed)) return Number(trimmed);

  const match = /^(\d{1,3}):([0-5]\d)$/.exec(trimmed);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
