// The books of the Bible with their OSIS ids, e.g. "John", and the names and
// abbreviations that a reference can use, in English and Hungarian
// (Protestant and Catholic). The names are lower case, without dots and
// spaces. A book with a number has it in front: "1kor" for "1 Kor." Not the
// words that are also common item titles, e.g. "song" or "ének".
//
// The OSIS ids are also the names of the files of the text (see `load.ts`).

export const BOOKS: [id: string, names: string][] = [
  // Old Testament
  ["Gen", "gen gn genesis 1móz 1mózes ter teremtés"],
  ["Exod", "ex exod exodus 2móz 2mózes kiv kivonulás"],
  ["Lev", "lev leviticus 3móz 3mózes leviták"],
  ["Num", "num numbers 4móz 4mózes szám számok"],
  ["Deut", "deut dt deuteronomy 5móz 5mózes mtörv törv"],
  ["Josh", "josh joshua józs józsué"],
  ["Judg", "judg judges bír bírák"],
  ["Ruth", "ruth rut"],
  ["1Sam", "1sam 1samuel 1sám 1sámuel"],
  ["2Sam", "2sam 2samuel 2sám 2sámuel"],
  ["1Kgs", "1kgs 1kings 1kir 1királyok"],
  ["2Kgs", "2kgs 2kings 2kir 2királyok"],
  ["1Chr", "1chr 1chron 1chronicles 1krón 1krónikák"],
  ["2Chr", "2chr 2chron 2chronicles 2krón 2krónikák"],
  ["Ezra", "ezra ezsd ezsdrás"],
  ["Neh", "neh nehemiah nehémiás nehemiás"],
  ["Esth", "esth esther eszt eszter"],
  ["Job", "job jób"],
  ["Ps", "ps psa psalm psalms zsolt zsoltár zsoltárok"],
  ["Prov", "prov proverbs péld példabeszédek"],
  ["Eccl", "eccl eccles ecclesiastes préd prédikátor"],
  ["Song", "songofsongs songofsolomon én énekek énekekéneke"],
  ["Isa", "isa isaiah ézs ézsaiás iz izajás"],
  ["Jer", "jer jeremiah jeremiás"],
  ["Lam", "lam lamentations siral siralmak jsir"],
  ["Ezek", "ezek ezekiel ez ezék ezékiel"],
  ["Dan", "dan daniel dán dániel"],
  ["Hos", "hos hosea hós hóseás oz ozeás"],
  ["Joel", "joel jóel"],
  ["Amos", "amos ám ámósz ámosz"],
  ["Obad", "obad obadiah abd abdiás"],
  ["Jonah", "jonah jón jónás"],
  ["Mic", "mic micah mik mikeás"],
  ["Nah", "nah nahum náh náhum"],
  ["Hab", "hab habakkuk habakuk"],
  ["Zeph", "zeph zephaniah sof sofóniás szof szofoniás"],
  ["Hag", "hag haggai ag aggeus haggeus"],
  ["Zech", "zech zechariah zak zakariás"],
  ["Mal", "mal malachi malakiás"],
  // New Testament
  ["Matt", "matt mt matthew máté"],
  ["Mark", "mk mark márk"],
  ["Luke", "lk luke lukács"],
  ["John", "jn john jános ján"],
  ["Acts", "acts apcsel csel apostolokcselekedetei"],
  ["Rom", "rom romans róm róma rómaiakhoz"],
  ["1Cor", "1cor 1corinthians 1kor 1korinthus 1korintus 1korintusi 1korinthusiakhoz"],
  ["2Cor", "2cor 2corinthians 2kor 2korinthus 2korintus 2korintusi 2korinthusiakhoz"],
  ["Gal", "gal galatians galata galatákhoz"],
  ["Eph", "eph ephesians ef efezus efezusi"],
  ["Phil", "phil philippians fil filippi"],
  ["Col", "col colossians kol kolossé kolosszei"],
  ["1Thess", "1thess 1thessalonians 1thessz 1tessz 1thesszalonika 1tesszaloniki"],
  ["2Thess", "2thess 2thessalonians 2thessz 2tessz 2thesszalonika 2tesszaloniki"],
  ["1Tim", "1tim 1timothy 1timóteus"],
  ["2Tim", "2tim 2timothy 2timóteus"],
  ["Titus", "tit titus titusz"],
  ["Phlm", "phlm philem philemon filem filemon"],
  ["Heb", "heb hebrews zsid zsidók zsidókhoz"],
  ["Jas", "jas james jak jakab"],
  ["1Pet", "1pet 1peter 1pt 1pét 1péter"],
  ["2Pet", "2pet 2peter 2pt 2pét 2péter"],
  ["1John", "1jn 1john 1jános 1ján"],
  ["2John", "2jn 2john 2jános 2ján"],
  ["3John", "3jn 3john 3jános 3ján"],
  ["Jude", "jude júd júdás"],
  ["Rev", "rev revelation jel jelenések"],
  // Deuterocanonical books: the Protestant translations do not have them.
  ["Tob", "tob tobit tób tóbiás"],
  ["Jdt", "jdt judith jud judit"],
  ["Wis", "wis wisdom bölcs bölcsesség"],
  ["Sir", "sir sirach sirák"],
  ["Bar", "bar baruch bár báruk"],
  ["1Macc", "1macc 1maccabees 1makk 1makkabeusok"],
  ["2Macc", "2macc 2maccabees 2makk 2makkabeusok"],
];

/** The books that only the Catholic and Orthodox translations have. */
export const DEUTEROCANONICAL_BOOKS: ReadonlySet<string> = new Set([
  "Tob",
  "Jdt",
  "Wis",
  "Sir",
  "Bar",
  "1Macc",
  "2Macc",
]);

/** The OSIS ids of the books, in order. */
export const BOOK_IDS: string[] = BOOKS.map(([id]) => id);

const BY_NAME = new Map(
  BOOKS.flatMap(([id, names]) => names.split(" ").map((name) => [name, id] as const)),
);

/**
 * The OSIS id of a book, or null. `name` is as the user types it, e.g.
 * "1 Kor.", "Ap.Csel." or "Song of Songs".
 */
export function bookId(name: string): string | null {
  return BY_NAME.get(name.normalize("NFC").toLowerCase().replace(/[\s.]/g, "")) ?? null;
}

// The usual abbreviation of each book, in the order of `BOOKS`: Hungarian
// (Protestant), then English.
const HUNGARIAN_ABBREVIATIONS =
  "1Móz 2Móz 3Móz 4Móz 5Móz Józs Bír Ruth 1Sám 2Sám 1Kir 2Kir 1Krón 2Krón Ezsd Neh Eszt Jób Zsolt Péld Préd Énekek Ézs Jer JSir Ez Dán Hós Jóel Ám Abd Jón Mik Náh Hab Sof Hag Zak Mal " +
  "Mt Mk Lk Jn ApCsel Róm 1Kor 2Kor Gal Ef Fil Kol 1Thessz 2Thessz 1Tim 2Tim Tit Filem Zsid Jak 1Pt 2Pt 1Jn 2Jn 3Jn Júd Jel " +
  "Tób Jdt Bölcs Sir Bár 1Makk 2Makk";
const ENGLISH_ABBREVIATIONS =
  "Gen Exod Lev Num Deut Josh Judg Ruth 1_Sam 2_Sam 1_Kgs 2_Kgs 1_Chr 2_Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal " +
  "Matt Mark Luke John Acts Rom 1_Cor 2_Cor Gal Eph Phil Col 1_Thess 2_Thess 1_Tim 2_Tim Titus Phlm Heb Jas 1_Pet 2_Pet 1_John 2_John 3_John Jude Rev " +
  "Tob Jdt Wis Sir Bar 1_Macc 2_Macc";

const ABBREVIATIONS = {
  hu: new Map(HUNGARIAN_ABBREVIATIONS.split(" ").map((name, index) => [BOOK_IDS[index], name])),
  en: new Map(
    ENGLISH_ABBREVIATIONS.split(" ").map((name, index) => [
      BOOK_IDS[index],
      name.replace("_", " "),
    ]),
  ),
};

/** The usual abbreviation of a book, e.g. "ApCsel" or "Acts". */
export function bookAbbreviation(id: string, english: boolean): string {
  return ABBREVIATIONS[english ? "en" : "hu"].get(id) ?? id;
}

/** The book after `id`, or null after the last one. Without `deuterocanon`, Revelation is the last. */
export function nextBook(id: string, deuterocanon: boolean): string | null {
  const books = deuterocanon
    ? BOOK_IDS
    : BOOK_IDS.filter((book) => !DEUTEROCANONICAL_BOOKS.has(book));
  const index = books.indexOf(id);
  return index >= 0 ? (books[index + 1] ?? null) : null;
}
