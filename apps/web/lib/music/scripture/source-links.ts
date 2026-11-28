import { bookAbbreviation } from "./books";
import type { ScriptureRange, ScriptureReference } from "./reference";

// Links to the chapter of a reference on the websites that the users copy
// the text of a "pasted" translation from (see `translations.ts` and
// `paste.ts`):
//
// - szentiras.eu, e.g. https://szentiras.eu/RUF/Jn3,16-22: a page with
//   only the verses of the reference, with their numbers.
// - abibliamindenkie.hu, of the Hungarian Bible Society, e.g.
//   https://abibliamindenkie.hu/uj/JHN/3#16: the anchor goes to the first verse.
// - bible.com (YouVersion), e.g. https://www.bible.com/bible/920/JHN.3.R%C3%9AF.
//   Not its page of the verses (e.g. "JHN.3.16-21"): that page shows the text
//   without the verse numbers, and `paste.ts` needs them. bible.com has no
//   link that selects the verses on the chapter page.

// The USFM code of each Protestant book on abibliamindenkie.hu and bible.com,
// by its OSIS id (see `books.ts`).
const USFM_CODES: Readonly<Record<string, string>> = {
  Gen: "GEN",
  Exod: "EXO",
  Lev: "LEV",
  Num: "NUM",
  Deut: "DEU",
  Josh: "JOS",
  Judg: "JDG",
  Ruth: "RUT",
  "1Sam": "1SA",
  "2Sam": "2SA",
  "1Kgs": "1KI",
  "2Kgs": "2KI",
  "1Chr": "1CH",
  "2Chr": "2CH",
  Ezra: "EZR",
  Neh: "NEH",
  Esth: "EST",
  Job: "JOB",
  Ps: "PSA",
  Prov: "PRO",
  Eccl: "ECC",
  Song: "SNG",
  Isa: "ISA",
  Jer: "JER",
  Lam: "LAM",
  Ezek: "EZK",
  Dan: "DAN",
  Hos: "HOS",
  Joel: "JOL",
  Amos: "AMO",
  Obad: "OBA",
  Jonah: "JON",
  Mic: "MIC",
  Nah: "NAM",
  Hab: "HAB",
  Zeph: "ZEP",
  Hag: "HAG",
  Zech: "ZEC",
  Mal: "MAL",
  Matt: "MAT",
  Mark: "MRK",
  Luke: "LUK",
  John: "JHN",
  Acts: "ACT",
  Rom: "ROM",
  "1Cor": "1CO",
  "2Cor": "2CO",
  Gal: "GAL",
  Eph: "EPH",
  Phil: "PHP",
  Col: "COL",
  "1Thess": "1TH",
  "2Thess": "2TH",
  "1Tim": "1TI",
  "2Tim": "2TI",
  Titus: "TIT",
  Phlm: "PHM",
  Heb: "HEB",
  Jas: "JAS",
  "1Pet": "1PE",
  "2Pet": "2PE",
  "1John": "1JN",
  "2John": "2JN",
  "3John": "3JN",
  Jude: "JUD",
  Rev: "REV",
};

/**
 * Where a translation is on the websites. `szentiras`: the abbreviation of
 * the translation on szentiras.eu, e.g. "RUF". `bibliaMindenkie`: its path on
 * abibliamindenkie.hu, e.g. "uj". `bibleCom`: its version on bible.com, e.g.
 * `{ id: 920, abbreviation: "RÚF" }`.
 */
export type TextSources = {
  szentiras?: string;
  bibliaMindenkie?: string;
  bibleCom?: { id: number; abbreviation: string };
};

/** A link to the chapter, with the domain of the website for its label. */
export type SourceLink = { site: string; url: string };

/**
 * The links to the reference on szentiras.eu, and to its first chapter on
 * the other websites. None for a book that the websites do not have in this form.
 */
export function sourceLinks(reference: ScriptureReference, sources: TextSources): SourceLink[] {
  const book = USFM_CODES[reference.book];
  const from = reference.ranges[0]?.from;
  if (!book || !from) return [];
  const links: SourceLink[] = [];
  if (sources.szentiras) {
    const places = reference.ranges.map(hungarianPlace).join(";");
    links.push({
      site: "szentiras.eu",
      url: `https://szentiras.eu/${encodeURIComponent(sources.szentiras)}/${encodeURIComponent(bookAbbreviation(reference.book, false))}${places}`,
    });
  }
  if (sources.bibliaMindenkie) {
    const verse = from.verse !== null ? `#${from.verse}` : "";
    links.push({
      site: "abibliamindenkie.hu",
      url: `https://abibliamindenkie.hu/${encodeURIComponent(sources.bibliaMindenkie)}/${book}/${from.chapter}${verse}`,
    });
  }
  if (sources.bibleCom) {
    const { id, abbreviation } = sources.bibleCom;
    links.push({
      site: "bible.com",
      url: `https://www.bible.com/bible/${id}/${book}.${from.chapter}.${encodeURIComponent(abbreviation)}`,
    });
  }
  return links;
}

/** A range in the Hungarian form, e.g. "3,16-22", "3" or "5,1-7,29". */
function hungarianPlace({ from, to }: ScriptureRange): string {
  const start = from.verse === null ? `${from.chapter}` : `${from.chapter},${from.verse}`;
  if (to.chapter === from.chapter && to.verse === from.verse) return start;
  if (to.chapter === from.chapter) return to.verse === null ? start : `${start}-${to.verse}`;
  return `${start}-${to.verse === null ? to.chapter : `${to.chapter},${to.verse}`}`;
}
