// Finds the syllable that a chord falls on. ChordPro puts a chord before the
// syllable where it changes: in `A[D]mazing grace`, the D comes on "ma".
//
// The rules are a guess that does not know the language of the song. They
// work well enough for English and Hungarian: a syllable is the consonants
// before a group of vowels, the vowels, and the consonants after them except
// the last one (or the last two letters of a digraph, e.g. "th" or "gy"),
// which start the next syllable. At the end of the word, all the consonants
// stay with the syllable.

const VOWELS = new Set("aeiou");
/** Two letters for one consonant. They start the next syllable together. */
const DIGRAPHS = new Set([
  "ch",
  "ph",
  "sh",
  "th",
  "wh",
  "cs",
  "dz",
  "gy",
  "ly",
  "ny",
  "sz",
  "ty",
  "zs",
]);

const LETTER = /[\p{L}\p{M}]/u;
const MARK = /\p{M}/u;
const APOSTROPHE = /['’]/;

type Kind = "vowel" | "consonant";

/**
 * The start and the end (exclusive) of the first syllable in `text`, or null
 * if the first word of the text has no letters. Spaces and punctuation before
 * the word are skipped. The syllable does not go past the end of the text:
 * the next chord starts a new syllable.
 */
export function firstSyllable(text: string): { start: number; end: number } | null {
  const wordStart = text.search(/\S/);
  if (wordStart === -1) return null;
  let start = wordStart;
  while (start < text.length && !LETTER.test(text[start]!) && !/\s/.test(text[start]!)) start++;
  if (start >= text.length || !LETTER.test(text[start]!)) return null;

  let end = start;
  while (
    end < text.length &&
    (LETTER.test(text[end]!) || (APOSTROPHE.test(text[end]!) && LETTER.test(text[end + 1] ?? "")))
  ) {
    end++;
  }
  const word = text.slice(start, end);
  return { start, end: start + syllableLength(word) };
}

function syllableLength(word: string) {
  const kinds = classify(word);
  let index = 0;
  while (index < kinds.length && kinds[index] === "consonant") index++;
  while (index < kinds.length && kinds[index] === "vowel") index++;

  const codaStart = index;
  while (index < kinds.length && kinds[index] === "consonant") index++;
  // No more vowels in the word: the consonants stay with this syllable.
  if (index === kinds.length) return word.length;

  const coda = word.slice(codaStart, index);
  const next = DIGRAPHS.has(coda.slice(-2).toLowerCase()) ? 2 : 1;
  return Math.max(codaStart, index - next);
}

/**
 * Vowel or consonant for each code unit. A combining mark has the kind of the
 * letter before it. A "y" is a vowel when no vowel comes before it in the word
 * and the next letter is not a vowel, as in "my" and "hymn", but not in "yes".
 * At the end of a word it is a vowel too, as in "glory", except after g, l, n
 * and t, as in "nagy" and "hely" (a guess that misses "holy").
 */
function classify(word: string): Kind[] {
  const chars = Array.from(word);
  const bases = chars.map((char) => char.normalize("NFD")[0]!.toLowerCase());
  const kinds: Kind[] = [];
  let vowelSeen = false;
  for (const [index, char] of chars.entries()) {
    let kind: Kind;
    if (MARK.test(char)) {
      kind = kinds[kinds.length - 1] ?? "consonant";
    } else if (bases[index] === "y") {
      const previous = bases[index - 1] ?? "";
      const final =
        index === chars.length - 1 &&
        previous !== "" &&
        !VOWELS.has(previous) &&
        !"glnt".includes(previous);
      kind =
        (!vowelSeen && !VOWELS.has(bases[index + 1] ?? "")) || (vowelSeen && final)
          ? "vowel"
          : "consonant";
    } else {
      kind = VOWELS.has(bases[index]!) ? "vowel" : "consonant";
    }
    if (kind === "vowel") vowelSeen = true;
    for (let unit = 0; unit < char.length; unit++) kinds.push(kind);
  }
  return kinds;
}
