import type { Article } from "./types";

const VOWEL_RE = /^[aáeéiíoóöőuúüű]/i;

/** Thousands separators accepted inside numbers: space, no-break space, thin and narrow no-break space. */
const NUMBER_RE = /^\d{1,3}(?:[ \u00a0\u2009\u202f]\d{3})+(?!\d)|^\d+/;

const UNITS = ["nulla", "egy", "kettő", "három", "négy", "öt", "hat", "hét", "nyolc", "kilenc"];
const HUNDREDS = ["", "száz", "két", "három", "négy", "öt", "hat", "hét", "nyolc", "kilenc"];
const TENS = [
  "",
  "",
  "",
  "harminc",
  "negyven",
  "ötven",
  "hatvan",
  "hetven",
  "nyolcvan",
  "kilencven",
];

/**
 * The first word with which Hungarian speaks the number `digits` (no sign, no separators).
 *
 * The number is split into groups of three digits; the spoken form always starts with
 * the leading group (`1956` → *ezerkilencszázötvenhat* → `ezer`; `2026` → *kétezer-…* →
 * `két`; `1 000 000` → *egymillió* → `egy`; `50` → *ötven*; `100` → *száz*).
 *
 * @example leadingNumberWord("5") // "öt"
 * @example leadingNumberWord("1956") // "ezer"
 */
export function leadingNumberWord(digits: string): string {
  const stripped = digits.replace(/^0+(?=\d)/, "");
  if (!/^\d+$/.test(stripped)) throw new RangeError(`Not a digit string: "${digits}"`);
  const scale = Math.floor((stripped.length - 1) / 3); // 0 units, 1 thousands, 2 millions, …
  const lead = Number(stripped.slice(0, ((stripped.length - 1) % 3) + 1));

  if (lead >= 100) return HUNDREDS[Math.floor(lead / 100)] as string;
  if (lead >= 30) return TENS[Math.floor(lead / 10)] as string;
  if (lead >= 21) return "huszon";
  if (lead === 20) return "húsz";
  if (lead >= 11) return "tizen";
  if (lead === 10) return "tíz";
  if (lead === 1 && scale === 1) return "ezer"; // "egyezer" is not said
  if (lead === 2 && scale >= 1) return "két";
  return UNITS[lead] as string;
}

/**
 * Chooses the definite article for the *spoken* form of `text`: `az` before a vowel sound,
 * `a` before a consonant sound.
 *
 * - Words: decided by the first letter (`az egyház`, `az óra`, `az őrangyal`, `a templom`).
 *   Leading punctuation such as quotes or brackets is skipped.
 * - Numbers: decided by the first spoken word. `az 1` (egy), `az 5` (öt), `a 10` (tíz),
 *   `az 50` (ötven), `a 100` (száz), `az 1000` (ezer), `az 5000` (ötezer), `a 2026` (kétezer…),
 *   `az 1956` (ezerkilencszáz…), `az 1 000 000` (egymillió). Ordinals (`az 5.`, `a 10.`),
 *   suffixed numbers (`az 5-ös`) and decimals (`az 5,5`) follow the same rule.
 * - A leading minus or plus is spoken *mínusz* / *plusz*, hence `a`.
 *
 * Limitation: abbreviations are decided by their first written letter, like words
 * (`a MÁV`, `az OTP`). Acronyms that are spelled out letter by letter (*az MNB*, spoken
 * "emenbé") are not detected; pass the spoken form if that matters.
 *
 * @example article("egyház") // "az"
 * @example article("1956") // "az"
 */
export function article(text: string): Article {
  const s = text.replace(/^[^\p{L}\p{N}+\-−]+/u, "");
  if (/^[-−+]\d/.test(s)) return "a";
  const body = s.replace(/^[-−+]+/, "");
  const num = NUMBER_RE.exec(body);
  if (num) {
    const word = leadingNumberWord(num[0].replace(/\D/g, ""));
    return VOWEL_RE.test(word) ? "az" : "a";
  }
  return VOWEL_RE.test(body) ? "az" : "a";
}

/** Options for {@link withArticle}. */
export interface WithArticleOptions {
  /** Capitalise the article (`Az 5. vasárnap`) for sentence starts. Default `false`. */
  capitalize?: boolean;
}

/**
 * Prefixes `text` with the right article.
 *
 * @example withArticle("5. vasárnap") // "az 5. vasárnap"
 * @example withArticle("10 órai mise") // "a 10 órai mise"
 * @example withArticle("miserend", { capitalize: true }) // "A miserend"
 */
export function withArticle(text: string, options: WithArticleOptions = {}): string {
  const a = article(text);
  const art = options.capitalize ? a.charAt(0).toUpperCase() + a.slice(1) : a;
  return `${art} ${text}`;
}
