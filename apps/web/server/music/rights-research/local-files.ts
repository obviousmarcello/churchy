import "server-only";

import {
  RESEARCH_FILE_VERSION,
  RESEARCH_FINDINGS_FORMAT,
  RESEARCH_SONGS_FORMAT,
} from "@/lib/music/song-rights-research";
import { RESEARCH_SYSTEM_PROMPT, songLyrics } from "./prompt";
import { RESEARCH_RESULT_JSON_SCHEMA } from "./result";

// The file of the open songs for a research on the computer of a superadmin
// (see `docs/song-rights-findings.md`). The settings page downloads it, and
// `scripts/export-song-rights-songs.mjs` writes it from the production
// database. Keep this module free of database and session code: the script
// bundles it.

/** A song as the database gives it: the default arrangement in `chordpro`. */
export type LocalResearchSongRow = {
  id: string;
  title: string;
  artist: string | null;
  copyright: string | null;
  songbook: string | null;
  chordpro: string;
};

export type LocalResearchSongsFile = {
  format: typeof RESEARCH_SONGS_FORMAT;
  version: typeof RESEARCH_FILE_VERSION;
  exportedAt: string;
  /** How to write the file of the upload, then the rules. */
  instructions: string;
  /** The rules of the research: the same as for the providers. */
  rules: string;
  /** The JSON schema of `result` in each finding of the upload. */
  resultSchema: typeof RESEARCH_RESULT_JSON_SCHEMA;
  songs: {
    songId: string;
    title: string;
    artist: string | null;
    copyright: string | null;
    songbook: string | null;
    lyrics: string;
  }[];
};

/** The first part of the instructions: how to write the file of the upload. */
function localResearchInstructions(year: number): string {
  return `Research each song in "songs" with the rules below. The current year is ${year}: use it for the public domain test. Then write one JSON file for the upload on the song rights page:
{"format": "${RESEARCH_FINDINGS_FORMAT}", "version": ${RESEARCH_FILE_VERSION}, "model": "<the model that researched>", "findings": [{"songId": "<songId of the song>", "title": "<title of the song>", "result": <the answer for the song>}]}
Each "result" must match "resultSchema". Leave out a song that you did not research.`;
}

export function localResearchSongsFile(
  rows: LocalResearchSongRow[],
  now = new Date(),
): LocalResearchSongsFile {
  return {
    format: RESEARCH_SONGS_FORMAT,
    version: RESEARCH_FILE_VERSION,
    exportedAt: now.toISOString(),
    instructions: `${localResearchInstructions(now.getUTCFullYear())}\n\n${RESEARCH_SYSTEM_PROMPT}`,
    rules: RESEARCH_SYSTEM_PROMPT,
    resultSchema: RESEARCH_RESULT_JSON_SCHEMA,
    songs: rows
      .map((row) => ({
        songId: row.id,
        title: row.title,
        artist: row.artist,
        copyright: row.copyright,
        songbook: row.songbook,
        lyrics: songLyrics(row.chordpro),
      }))
      // A song without lyrics gives nothing to research. The lyrics of the
      // database can have lines that `songLyrics()` removes, e.g. only chords.
      .filter((song) => song.lyrics),
  };
}
