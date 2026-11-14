/**
 * Hungarian collation via `Intl.Collator('hu')` (ICU / CLDR).
 *
 * Verified behaviour of Node's ICU (see `collation.test.ts`):
 * - Digraphs and the trigraph are single letters: `c < cs < d`, `d < dz < dzs < e`,
 *   `g < gy < h`, `l < ly < m`, `n < ny < o`, `s < sz < t`, `t < ty < u`, `z < zs`.
 *   Hence `gz < gy` (g followed by z sorts before the letter gy) and `sa < sz`.
 * - Doubled digraphs written `ccs`, `ggy`, `ssz`, … get the primary weights of `cscs`, `gygy`,
 *   `szsz` (they differ from the spelled-out form only at the tertiary level).
 * - Long and short vowels share a primary weight and differ only on a secondary level:
 *   `o = ó < ö = ő < u = ú < ü = ű`, so `oa < óa < ob < öa < őa`.
 * - Lower-case sorts before upper-case when the letters are otherwise equal.
 */
const collator = new Intl.Collator("hu");

/**
 * Compares two strings in Hungarian alphabetical order. Usable directly as an `Array#sort` comparator.
 *
 * @example compareHu("cukor", "csiga") // -1  (cs comes after c)
 */
export function compareHu(a: string, b: string): number {
  return collator.compare(a, b);
}

/**
 * Returns a new array sorted in Hungarian alphabetical order (stable; the input is not mutated).
 *
 * @param list the items to sort
 * @param key  selects the string to compare; omit for arrays of strings
 *
 * @example sortHu(["zsolt", "zita", "csaba", "cecília"]) // ["cecília", "csaba", "zita", "zsolt"]
 * @example sortHu(people, (p) => p.name)
 */
export function sortHu(list: readonly string[]): string[];
export function sortHu<T>(list: readonly T[], key: (item: T) => string): T[];
export function sortHu<T>(list: readonly T[], key?: (item: T) => string): T[] {
  const get = key ?? ((item: T) => item as unknown as string);
  return [...list].sort((a, b) => collator.compare(get(a), get(b)));
}
