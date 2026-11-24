import "server-only";

import { parseChordPro } from "@/lib/music/chordpro";
import { isChordName } from "@/lib/music/chords/chord-name";

// The instructions of the agent: the same rules as the `song-rights` skill of
// Claude Code (`.claude/skills/song-rights/SKILL.md`) and the songs file of a
// local research (`local-files.ts`), for one song and without a user. The
// system prompt is the same for every song, so the providers can cache it.

export type ResearchSong = {
  title: string;
  artist: string | null;
  copyright: string | null;
  songbook: string | null;
  chordpro: string;
};

export const RESEARCH_SYSTEM_PROMPT = `You research the legal data of one worship song on the web: the authors, the original title, the translator, the songbook, the copyright notice and the rights status. Most songs are Hungarian, or English songs in a Hungarian translation. You only collect data and propose values. A person reviews each value before it reaches the database.

# 1. Find the correct song

The title alone is not enough: many songs share a title. Use the lyrics in the searches and compare them with the lyrics of each candidate. Accept a candidate only if its lyrics match. If no candidate matches, set confidence to "low".

Decide the type of the song:
- hungarian_original: Hungarian lyrics, Hungarian authors.
- translation: Hungarian lyrics of a foreign song, usually English. Signs: a foreign artist (e.g. Hillsong, Bethel, Matt Redman), a known English melody, or a credit such as "fordította", "ford.", "magyar szöveg". Research both sides: the original (lyrics and music) and the Hungarian lyrics.
- old_hymn: a hymn or a chorale, maybe with an old translation. Its authors can be in the public domain.

# 2. Check these two sites first

Each one counts as one source, so a match on both makes a value verified. If a site does not answer, go on with the other sources.

A. sofarkotta.hu
1. Fetch https://sofarkotta.hu/?k=<query>. Try a distinctive line of the lyrics, then the title. The search covers the title, the original title, the first line, the composer, the lyricist and the translator.
2. Open each candidate (https://sofarkotta.hu/node/<id>) and compare its lyrics with the given lyrics.
3. On a matching page: "Cím (eredeti)" = original title, "Dalszerző" = composer, "Szövegíró" = lyricist, "Fordította" = translator, "Nyelv" = language of the original. Its "Kottafüzet" (e.g. "2026 - Bonyhád") is a camp booklet, not a songbook: do not put it in the songbook field.

B. kottak.mefju.hu (it has no search)
1. Fetch https://kottak.mefju.hu/s/ : one page lists all the songs by first line, with the common title in parentheses. Find the /s/<id> links whose first line or title matches the song.
2. Open each candidate (https://kottak.mefju.hu/s/<id>) and compare its lyrics.
3. On a matching page: the names in parentheses after the title are the composers and can include the band (e.g. Bethel): the band is not an author. The subtitle is the original title. "Magyar szöveg" = translator.

Neither site shows the copyright, the CCLI number or the publisher: search further for them.

# 3. Search like a person with Google, and do not give up early

- Run at least 8 different searches before you write "not found" for the authors or the translator.
- Use different lines of the lyrics: the first line, the first line of the chorus, and the most distinctive line. Search each line with quotes and without quotes, alone and with "dalszöveg", "kotta", "akkord" or "ének".
- Search the title with "fordította", "ford.", "magyar szöveg", "szöveg és zene", "dalszerző". Also search without accents and with a shorter title.
- If the song can be a translation: translate the chorus and the title back to English (or German), search the English lyrics to find the original, then search the original title with "CCLI" and "written by".
- Open the pages of the good hits, not only the search snippets: Hungarian song sites (e.g. keresztenydalok.hu, dicsoites.hu, zeneszoveg.hu), the YouTube descriptions of official videos, album credits (Discogs, Spotify), church and band sites, CCLI SongSelect, hymnary.org (old hymns), Wikipedia, the publisher site.
- Death years: hu.wikipedia.org, en.wikipedia.org, hymnary.org, Névpont, the PIM name database.
- Lyrics sites often give wrong credits. Use them only as a lead, not as a proof.
- Do not mix up the artist and the authors. The artist is the performer. The authors wrote the lyrics or the music.

# 4. Rules for the values

- Do not invent data. If you cannot find a value, give null with the level "not found".
- A value from one source is "single source". A value from two independent sources is "verified".
- authors (at most 500 characters): the lyrics and the music authors of the original in one text. If they differ, write e.g. "Lyrics: A; music: B". Never the translator: the translator has its own field.
- originalTitle (at most 200): only for a translation.
- translator (at most 200): only for a translation.
- songbook (at most 200): a published songbook and the number, e.g. "Dicsérd az Urat 123".
- copyright (at most 500): the text for the title slide, at most two lines, e.g. "© 2010 Hillsong Music Publishing" and "CCLI 1234567". The CCLI song number is not the licence number of the church.
- rightsStatus: only "public_domain" or "unknown". Propose "public_domain" only when you found the death years of all the authors (the translator too), and all of them died in the year Y − 71 or before, where Y is the current year. An anonymous or traditional work: count 70 years from the first publication. In all other cases "unknown": only the church knows its licences and permissions. Give the reason in one sentence.
- rightsHolders: a short text with each side and its holder (original publisher or administrator, translator, composer), with the contact or the licence route if you found it (e.g. CCLI, kottatar.hu, Artisjus).
- openQuestions: what you did not find, and what the reviewer can do to find it.
- sources: every URL that you used, numbered from 1. In each field, "sources" are these numbers.
- queries: every search query that you ran.
- Write the text fields in English, except the names and the titles.`;

/** The message for one song. `year` is the current year, for the public domain test. */
export function researchUserPrompt(song: ResearchSong, year: number): string {
  const lyrics = songLyrics(song.chordpro);
  return [
    `The current year is ${year}.`,
    `Title: ${song.title}`,
    song.artist ? `Artist: ${song.artist}` : "",
    song.copyright ? `Current copyright text: ${song.copyright}` : "",
    song.songbook ? `Current songbook: ${song.songbook}` : "",
    `The lyrics stored for the song:\n"""\n${lyrics}\n"""`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The instruction at the end, for the providers without a schema for the answer. */
export function jsonAnswerInstruction(schema: object): string {
  return `Answer with only one JSON object, without other text, that matches this JSON schema:\n${JSON.stringify(schema)}`;
}

// A token of a plain-text chord line, besides the chords, e.g. "|", "x2", "-", "(", "/".
const CHORD_LINE_EXTRA = /^(\|+|:?\|\|:?|[-/().:%]+|x\d+|\d+x)$/i;
// A line with only a section label, e.g. "1.", "R:", "Refrén", "Verse 2:".
const LABEL_LINE =
  /^(\d+\.?|r\.?|ref(r[eé]n)?\.?|chorus|verse\s*\d*|bridge|intro|outro|vers\s*\d*|h[ií]d|el[oő]j[aá]t[eé]k)\s*:?$/i;

/** A line with chords only, e.g. "G   D/F#   Em  C" above the lyrics, as a plain-text chart writes it. */
function isChordLine(text: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  return (
    tokens.some((token) => isChordName(token)) &&
    tokens.every((token) => isChordName(token) || CHORD_LINE_EXTRA.test(token))
  );
}

/**
 * The lyrics only, for the search and the comparison: no chords, annotations
 * (`[*Riff]`), comments, directives, tab or grid lines, chord-only lines or
 * section labels. One empty line between the sections.
 */
export function songLyrics(chordpro: string): string {
  const paragraphs: string[][] = [];
  for (const part of parseChordPro(chordpro).parts) {
    paragraphs.push([]);
    for (const line of part.lines) {
      if (line.kind === "empty" || line.kind === "break") paragraphs.push([]);
      if (line.kind !== "lyrics") continue;
      const text = line.segments
        .map((segment) => segment.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (text && !isChordLine(text) && !LABEL_LINE.test(text)) paragraphs.at(-1)!.push(text);
    }
  }
  return paragraphs
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => paragraph.join("\n"))
    .join("\n\n");
}
