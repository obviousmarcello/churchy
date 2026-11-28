// Converts a Bible of the SWORD Project (https://crosswire.org/sword/) into
// the text files of the app: `public/bible/<translation>/<book>.json`, one
// file per book, `{ "chapters": string[][] }` (see `src/lib/scripture/`).
// Run it once for each translation, then commit the files.
//
//   node scripts/import-bible.mts <module folder> <translation id>
//
// The module folder is the unzipped module, e.g. `HunKar.zip` from
// https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=HunKar, with
// `mods.d/` and `modules/` in it. Only a module that the app can show
// without a licence (public domain): check its `.conf` file.
//
// The script reads only compressed OSIS text modules (zText, zText4) with
// zip compression. The chapters and the verses come from the markup of the
// module, so any versification works: e.g. Calvin, where the title of a
// psalm is its first verse, as in the Károli Bible. It removes the notes,
// the headings that are not scripture and the markup.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

const [folder, translation] = process.argv.slice(2);
if (!folder || !translation || !/^[a-z0-9]{1,30}$/.test(translation)) {
  fail("Usage: node scripts/import-bible.mts <module folder> <translation id, e.g. karoli1908>");
}

const conf = readConf(folder);
const driver = conf.get("ModDrv")?.toLowerCase();
if (driver !== "ztext" && driver !== "ztext4")
  fail(`ModDrv ${conf.get("ModDrv")}: only zText and zText4`);
if ((conf.get("CompressType") ?? "ZIP").toUpperCase() !== "ZIP")
  fail(`CompressType ${conf.get("CompressType")}: only ZIP`);
if (conf.get("SourceType")?.toUpperCase() !== "OSIS")
  fail(`SourceType ${conf.get("SourceType")}: only OSIS`);
if (conf.get("CipherKey")) fail("The module is locked (CipherKey)");
console.log(`${conf.get("Description")} · ${conf.get("DistributionLicense") ?? "no licence"}`);

const latin1 = (conf.get("Encoding") ?? "").toUpperCase() !== "UTF-8";
const dataPath = join(folder, (conf.get("DataPath") ?? "").replace(/^\.\//, ""));
const verseEntrySize = driver === "ztext4" ? 12 : 10;

const outFolder = join("public", "bible", translation);
mkdirSync(outFolder, { recursive: true });

let written = 0;
for (const testament of ["ot", "nt"] as const) {
  const reader = testamentReader(testament);
  if (!reader) continue;
  // Each book and each chapter has an entry of its own before its verses:
  // its heading, with `<div osisID="Gen" type="book">` and `<chapter osisID="Gen.1" sID=…>`.
  // The entries before the first book are the headings of the module and of the testament.
  // Null: a verse with its text in the verse before it (see `verseTexts`).
  const books: { id: string; chapters: (string | null)[][] }[] = [];
  for (let entry = 0; entry < reader.entries; entry++) {
    const markup = reader.read(entry);
    // The start of a book, not its end (`eID`), which is in its last verse.
    const book = /<div\b(?=[^>]*\btype="book")(?=[^>]*\bsID=)[^>]*\bosisID="([^"]+)"/.exec(
      markup,
    )?.[1];
    const chapter = /<chapter\b(?=[^>]*\bsID=)[^>]*\bosisID="([^".]+)\.(\d+)"/.exec(markup);
    if (book) {
      books.push({ id: book, chapters: [] });
    } else if (chapter) {
      const current = books.at(-1);
      if (current?.id !== chapter[1] || Number(chapter[2]) !== current.chapters.length + 1) {
        fail(
          `${testament} entry ${entry}: chapter ${chapter[1]}.${chapter[2]} is not the next chapter`,
        );
      }
      current.chapters.push([]);
    } else {
      const verses = books.at(-1)?.chapters.at(-1);
      if (verses) verses.push(...verseTexts(markup, verses.length + 1));
      else if (cleanText(markup))
        fail(`${testament} entry ${entry}: text before the first chapter`);
    }
  }

  for (const { id, chapters } of books) {
    // The versification can have more verses than the text: e.g. a verse that the translation leaves out.
    for (const verses of chapters) while (verses.length > 0 && verses.at(-1) === "") verses.pop();
    if (chapters.every((verses) => verses.length === 0)) continue;
    const text = chapters.map((verses) => verses.map((verse) => verse ?? ""));
    writeFileSync(join(outFolder, `${id}.json`), JSON.stringify({ chapters: text }));
    written++;
  }
}
console.log(`${written} books in ${outFolder}`);

/** The text of each entry of the verse index of a testament. Null when the module does not have the testament. */
function testamentReader(testament: "ot" | "nt") {
  let verseIndex: Buffer, blockIndex: Buffer, blocks: Buffer;
  try {
    verseIndex = readFileSync(join(dataPath, `${testament}.bzv`));
    blockIndex = readFileSync(join(dataPath, `${testament}.bzs`));
    blocks = readFileSync(join(dataPath, `${testament}.bzz`));
  } catch {
    console.warn(`No ${testament} in the module`);
    return null;
  }

  const cache = new Map<number, Buffer>();
  function block(number: number): Buffer {
    let data = cache.get(number);
    if (!data) {
      const offset = blockIndex.readUInt32LE(number * 12);
      const size = blockIndex.readUInt32LE(number * 12 + 4);
      data = inflateSync(blocks.subarray(offset, offset + size));
      cache.set(number, data);
    }
    return data;
  }

  function read(entry: number): string {
    const at = entry * verseEntrySize;
    if (at + verseEntrySize > verseIndex.length) return "";
    const blockNumber = verseIndex.readUInt32LE(at);
    const start = verseIndex.readUInt32LE(at + 4);
    const size =
      verseEntrySize === 12 ? verseIndex.readUInt32LE(at + 8) : verseIndex.readUInt16LE(at + 8);
    if (size === 0) return "";
    const bytes = block(blockNumber).subarray(start, start + size);
    return latin1 ? bytes.toString("latin1") : bytes.toString("utf8");
  }

  return { read, entries: Math.floor(verseIndex.length / verseEntrySize) };
}

/**
 * The texts of the entry of verse `slot`: one verse, or more. When the
 * translation has more verses in a chapter than the versification of the
 * module, the module has the extra verses in the last verse of the chapter,
 * e.g. Ezek 20,45-49 (Károli) in Ezek 20:44 (Calvin). The notes after each
 * verse tell its number (`osisID="Ezek.20.46!crossReference.c46"`), so the
 * text before such a note goes up to that verse. A part with more verses
 * than one stays as one text, at its first verse; the others are null.
 */
function verseTexts(markup: string, slot: number): (string | null)[] {
  const parts = markup.split(/(?<=<\/note>)/);
  const numbers = parts.map((part) =>
    Number(/<note\b[^>]*\bosisID="[^".]+\.\d+\.(\d+)!/.exec(part)?.[1] ?? Number.NaN),
  );
  if (!numbers.some((number) => number > slot)) return [cleanText(markup)];

  const texts: (string | null)[] = [];
  let text = "";
  parts.forEach((part, index) => {
    text += part;
    const number = numbers[index];
    const next = slot + texts.length;
    // A note of this verse or of a later one ends the text. Other parts, e.g. a second note of the same verse, go on.
    if (
      Number.isNaN(number) ||
      number < next ||
      (index + 1 < parts.length && numbers[index + 1] === number)
    )
      return;
    texts.push(cleanText(text), ...Array.from({ length: number - next }, () => null));
    text = "";
  });
  if (cleanText(text)) texts.push(cleanText(text));
  return texts;
}

/** The text of a verse without the markup (OSIS, ThML or GBF), the notes and the headings that are not scripture. */
function cleanText(markup: string): string {
  return decodeEntities(
    markup
      .replace(/<note\b[^>]*\/>/g, "")
      .replace(/<note\b[\s\S]*?<\/note>/g, "")
      .replace(/<RF>[\s\S]*?<Rf>/g, "")
      .replace(/<scripRef\b[\s\S]*?<\/scripRef>/g, "")
      // A heading that is scripture, e.g. the title of a psalm, stays.
      .replace(/<title\b(?![^>]*canonical="true")[^>]*>[\s\S]*?<\/title>/g, "")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== "#") return named[name.toLowerCase()] ?? entity;
    return String.fromCodePoint(
      name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1)),
    );
  });
}

function readConf(folder: string): Map<string, string> {
  const confFolder = join(folder, "mods.d");
  const file = readdirSync(confFolder).find((name) => name.endsWith(".conf"));
  if (!file) fail(`No .conf file in ${confFolder}`);
  const conf = new Map<string, string>();
  for (const line of readFileSync(join(confFolder, file), "utf8").split(/\r?\n/)) {
    const match = /^(\w+)=(.*)$/.exec(line);
    if (match && !conf.has(match[1])) conf.set(match[1], match[2].trim());
  }
  return conf;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
